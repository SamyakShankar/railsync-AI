"""FastAPI orchestration and SQLite persistence for RailSync AI."""

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from optimizer.solver import solve


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATABASE_PATH = ROOT_DIR / "backend" / "railsync.db"
DATABASE_PATH = Path(os.getenv("RAILSYNC_DATABASE_PATH", DEFAULT_DATABASE_PATH))
SAMPLE_DATA_PATH = ROOT_DIR / "data" / "sample_data.json"
COA_PATH = Path(os.getenv("RAILSYNC_COA_PATH", ROOT_DIR / "data" / "coa.json"))
PLANNING_STATUSES = ("pending", "scheduled", "approved")
DEFAULT_OVERRUN_MIN = 40
DEPARTMENT_WORK_GROUPS = {
    "Engineering": "track",
    "Track Maintenance": "track",
    "Signal & Telecom": "signalling",
    "Electrical": "electrical",
}


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _format_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def load_coa(path: Path | None = None) -> dict[str, Any]:
    coa_path = path or COA_PATH
    with coa_path.open(encoding="utf-8") as coa_file:
        return json.load(coa_file)


def _windows_from_coa(coa: dict[str, Any]) -> list[dict[str, str]]:
    windows = []
    for corridor in coa["corridors"]:
        for window in corridor["windows"]:
            windows.append({
                "corridor_id": corridor["corridor_id"],
                "window_start": window["window_start"],
                "window_end": window["window_end"],
                "label": window.get("label", ""),
            })
    return windows


def apply_coa(coa: dict[str, Any]) -> None:
    global PLANNING_DATE, CORRIDOR_TRAFFIC, CORRIDOR_CAPACITY, TIMETABLE_WINDOWS, COA
    COA = coa
    PLANNING_DATE = date.fromisoformat(coa["planning_date"])
    CORRIDOR_TRAFFIC = {
        corridor["corridor_id"]: float(corridor["traffic_factor"])
        for corridor in coa["corridors"]
    }
    CORRIDOR_CAPACITY = {
        corridor["corridor_id"]: int(corridor["capacity"])
        for corridor in coa["corridors"]
    }
    TIMETABLE_WINDOWS = _windows_from_coa(coa)


COA: dict[str, Any] = {}
PLANNING_DATE = date(2026, 9, 9)
CORRIDOR_TRAFFIC: dict[str, float] = {}
CORRIDOR_CAPACITY: dict[str, int] = {}
TIMETABLE_WINDOWS: list[dict[str, str]] = []
apply_coa(load_coa())


class ApprovePlanRequest(BaseModel):
    schedule_id: str


class DisruptRequest(BaseModel):
    task_id: str
    reason: str
    overrun_min: int = Field(default=DEFAULT_OVERRUN_MIN, ge=0, le=24 * 60)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def work_group_for(department: str) -> str:
    return DEPARTMENT_WORK_GROUPS.get(department, department)


def clip_windows_after(
    windows: list[dict[str, str]],
    corridor_id: str,
    occupied_until: datetime,
) -> list[dict[str, str]]:
    clipped: list[dict[str, str]] = []
    for window in windows:
        if window["corridor_id"] != corridor_id:
            clipped.append(dict(window))
            continue
        start = _parse_datetime(window["window_start"])
        end = _parse_datetime(window["window_end"])
        new_start = max(start, occupied_until)
        if new_start < end:
            updated = dict(window)
            updated["window_start"] = _format_datetime(new_start)
            clipped.append(updated)
    return clipped


@contextmanager
def database() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def _connect_and_initialize() -> None:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with database() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                task_id TEXT PRIMARY KEY,
                corridor_id TEXT NOT NULL,
                department TEXT NOT NULL,
                description TEXT NOT NULL,
                severity INTEGER NOT NULL,
                estimated_duration_min INTEGER NOT NULL,
                last_maintenance_date TEXT NOT NULL,
                priority_score REAL NOT NULL,
                status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS schedules (
                schedule_id TEXT PRIMARY KEY,
                solve_status TEXT NOT NULL,
                lifecycle_status TEXT NOT NULL,
                unscheduled_task_ids TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS schedule_blocks (
                schedule_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                block_start TEXT NOT NULL,
                block_end TEXT NOT NULL,
                corridor_id TEXT NOT NULL,
                PRIMARY KEY (schedule_id, task_id),
                FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id)
            );
            CREATE TABLE IF NOT EXISTS disruptions (
                disruption_id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                reason TEXT NOT NULL,
                overrun_min INTEGER NOT NULL,
                occupied_until TEXT,
                created_at TEXT NOT NULL
            );
            """
        )
        task_count = connection.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        if task_count == 0:
            with SAMPLE_DATA_PATH.open(encoding="utf-8") as sample_file:
                sample_tasks = json.load(sample_file)
            connection.executemany(
                """
                INSERT INTO tasks (
                    task_id, corridor_id, department, description, severity,
                    estimated_duration_min, last_maintenance_date,
                    priority_score, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        task["task_id"], task["corridor_id"], task["department"],
                        task["description"], task["severity"],
                        task["estimated_duration_min"],
                        task["last_maintenance_date"],
                        task.get("priority_score", 0.0), task["status"],
                    )
                    for task in sample_tasks
                ],
            )


def _priority_score(task: sqlite3.Row) -> float:
    maintenance_date = date.fromisoformat(task["last_maintenance_date"])
    days_since_maintenance = max((PLANNING_DATE - maintenance_date).days, 0)
    age_score = min(days_since_maintenance / 180, 1.0)
    severity_score = max(0, min(int(task["severity"]), 5)) / 5
    traffic_score = CORRIDOR_TRAFFIC.get(task["corridor_id"], 0.5)
    score = (severity_score * 0.5 + age_score * 0.3 + traffic_score * 0.2) * 100
    return round(score, 2)


def _task_dict(task: sqlite3.Row) -> dict[str, Any]:
    return {
        "task_id": task["task_id"],
        "corridor_id": task["corridor_id"],
        "department": task["department"],
        "work_group": work_group_for(task["department"]),
        "description": task["description"],
        "severity": task["severity"],
        "estimated_duration_min": task["estimated_duration_min"],
        "last_maintenance_date": task["last_maintenance_date"],
        "priority_score": _priority_score(task),
        "status": task["status"],
    }


def _refresh_task_scores(connection: sqlite3.Connection) -> None:
    rows = connection.execute("SELECT * FROM tasks").fetchall()
    connection.executemany(
        "UPDATE tasks SET priority_score = ? WHERE task_id = ?",
        [(_priority_score(row), row["task_id"]) for row in rows],
    )


def _stored_schedule(connection: sqlite3.Connection, schedule_id: str) -> dict[str, Any]:
    schedule = connection.execute(
        "SELECT * FROM schedules WHERE schedule_id = ?", (schedule_id,)
    ).fetchone()
    if schedule is None:
        raise KeyError(schedule_id)
    blocks = connection.execute(
        """
        SELECT task_id, block_start, block_end, corridor_id
        FROM schedule_blocks WHERE schedule_id = ? ORDER BY block_start, task_id
        """,
        (schedule_id,),
    ).fetchall()
    return {
        "schedule_id": schedule["schedule_id"],
        "schedule": [dict(block) for block in blocks],
        "unscheduled_task_ids": json.loads(schedule["unscheduled_task_ids"]),
        "status": schedule["solve_status"],
        "lifecycle_status": schedule["lifecycle_status"],
    }


def _current_schedule_id(connection: sqlite3.Connection) -> str | None:
    schedule = connection.execute(
        """
        SELECT schedule_id FROM schedules
        WHERE lifecycle_status IN ('active', 'approved')
        ORDER BY created_at DESC LIMIT 1
        """
    ).fetchone()
    return None if schedule is None else schedule["schedule_id"]


def _supersede_current(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        UPDATE schedules SET lifecycle_status = 'superseded'
        WHERE lifecycle_status IN ('active', 'approved')
        """
    )


def _sync_task_plan_status(
    connection: sqlite3.Connection,
    scheduled_ids: list[str],
    candidate_ids: list[str],
) -> None:
    if scheduled_ids:
        placeholders = ",".join("?" for _ in scheduled_ids)
        connection.execute(
            f"UPDATE tasks SET status = 'scheduled' WHERE task_id IN ({placeholders})",
            scheduled_ids,
        )
    dropped_ids = [task_id for task_id in candidate_ids if task_id not in set(scheduled_ids)]
    if dropped_ids:
        placeholders = ",".join("?" for _ in dropped_ids)
        connection.execute(
            f"""
            UPDATE tasks SET status = 'pending'
            WHERE task_id IN ({placeholders})
              AND status IN ('pending', 'scheduled', 'approved')
            """,
            dropped_ids,
        )


def _persist_schedule(
    connection: sqlite3.Connection,
    result: dict[str, Any],
    candidate_ids: list[str],
    lifecycle_status: str = "active",
) -> dict[str, Any]:
    _supersede_current(connection)
    connection.execute(
        """
        INSERT INTO schedules (
            schedule_id, solve_status, lifecycle_status,
            unscheduled_task_ids, created_at
        ) VALUES (?, ?, ?, ?, ?)
        """,
        (
            result["schedule_id"], result["status"], lifecycle_status,
            json.dumps(result["unscheduled_task_ids"]), _utc_now(),
        ),
    )
    connection.executemany(
        """
        INSERT INTO schedule_blocks (
            schedule_id, task_id, block_start, block_end, corridor_id
        ) VALUES (?, ?, ?, ?, ?)
        """,
        [
            (
                result["schedule_id"], block["task_id"], block["block_start"],
                block["block_end"], block["corridor_id"],
            )
            for block in result["schedule"]
        ],
    )
    scheduled_ids = [block["task_id"] for block in result["schedule"]]
    _sync_task_plan_status(connection, scheduled_ids, candidate_ids)
    return _stored_schedule(connection, result["schedule_id"])


def _error(status_code: int, error: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": error, "detail": detail})


def _generate_for_tasks(
    connection: sqlite3.Connection,
    tasks: list[sqlite3.Row],
    timetable_windows: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    result = solve(
        [_task_dict(task) for task in tasks],
        CORRIDOR_CAPACITY,
        timetable_windows if timetable_windows is not None else TIMETABLE_WINDOWS,
    )
    return _persist_schedule(
        connection,
        result,
        candidate_ids=[task["task_id"] for task in tasks],
    )


def _plannable_tasks(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    return connection.execute(
        f"""
        SELECT * FROM tasks
        WHERE status IN ({",".join("?" for _ in PLANNING_STATUSES)})
        ORDER BY task_id
        """,
        PLANNING_STATUSES,
    ).fetchall()


def create_app() -> FastAPI:
    _connect_and_initialize()
    application = FastAPI(title="RailSync AI", version="0.3.0")
    allowed_origins = os.getenv(
        "RAILSYNC_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exception: RequestValidationError):
        return _error(422, "Validation error", str(exception.errors()))

    @application.exception_handler(Exception)
    async def unhandled_error_handler(_: Request, exception: Exception):
        return _error(500, "Internal server error", str(exception))

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/coa")
    def get_coa() -> dict[str, Any]:
        return COA

    @application.get("/tasks")
    def list_tasks() -> list[dict[str, Any]]:
        with database() as connection:
            _refresh_task_scores(connection)
            rows = connection.execute("SELECT * FROM tasks ORDER BY task_id").fetchall()
            return [_task_dict(row) for row in rows]

    @application.post("/plan/generate", response_model=None)
    def generate_plan() -> dict[str, Any] | JSONResponse:
        with database() as connection:
            _refresh_task_scores(connection)
            return _generate_for_tasks(connection, _plannable_tasks(connection))

    @application.post("/plan/approve", response_model=None)
    def approve_plan(request: ApprovePlanRequest) -> dict[str, str] | JSONResponse:
        with database() as connection:
            schedule = connection.execute(
                "SELECT * FROM schedules WHERE schedule_id = ?",
                (request.schedule_id,),
            ).fetchone()
            if schedule is None:
                return _error(404, "Schedule not found", request.schedule_id)
            if schedule["lifecycle_status"] == "superseded":
                return _error(409, "Schedule is superseded", request.schedule_id)
            connection.execute(
                "UPDATE schedules SET lifecycle_status = 'approved' WHERE schedule_id = ?",
                (request.schedule_id,),
            )
            connection.execute(
                """
                UPDATE tasks SET status = 'approved'
                WHERE task_id IN (
                    SELECT task_id FROM schedule_blocks WHERE schedule_id = ?
                )
                """,
                (request.schedule_id,),
            )
            return {
                "schedule_id": request.schedule_id,
                "lifecycle_status": "approved",
            }

    @application.post("/disrupt", response_model=None)
    def disrupt(request: DisruptRequest) -> dict[str, Any] | JSONResponse:
        with database() as connection:
            task = connection.execute(
                "SELECT * FROM tasks WHERE task_id = ?", (request.task_id,)
            ).fetchone()
            if task is None:
                return _error(404, "Task not found", request.task_id)

            occupied_until = None
            timetable_windows = TIMETABLE_WINDOWS
            current_id = _current_schedule_id(connection)
            if current_id is not None:
                block = connection.execute(
                    """
                    SELECT block_end, corridor_id FROM schedule_blocks
                    WHERE schedule_id = ? AND task_id = ?
                    """,
                    (current_id, request.task_id),
                ).fetchone()
                if block is not None:
                    occupied_until_dt = _parse_datetime(block["block_end"]) + timedelta(
                        minutes=request.overrun_min
                    )
                    occupied_until = _format_datetime(occupied_until_dt)
                    timetable_windows = clip_windows_after(
                        TIMETABLE_WINDOWS,
                        block["corridor_id"],
                        occupied_until_dt,
                    )

            connection.execute(
                "UPDATE tasks SET status = 'overrun' WHERE task_id = ?",
                (request.task_id,),
            )
            connection.execute(
                """
                INSERT INTO disruptions (
                    disruption_id, task_id, reason, overrun_min, occupied_until, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    f"DISRUPTION-{uuid4().hex}", request.task_id, request.reason,
                    request.overrun_min, occupied_until, _utc_now(),
                ),
            )
            _refresh_task_scores(connection)
            result = _generate_for_tasks(
                connection,
                _plannable_tasks(connection),
                timetable_windows,
            )
            return {
                "message": "Plan re-optimized after disruption",
                "schedule_id": result["schedule_id"],
                "reoptimization_required": True,
                "lifecycle_status": result["lifecycle_status"],
                "overrun_min": request.overrun_min,
                "occupied_until": occupied_until,
            }

    @application.get("/plan/current", response_model=None)
    def current_plan() -> dict[str, Any] | JSONResponse:
        with database() as connection:
            schedule_id = _current_schedule_id(connection)
            if schedule_id is None:
                return _error(404, "No current plan", "No active or approved schedule exists")
            return _stored_schedule(connection, schedule_id)

    return application


app = create_app()
