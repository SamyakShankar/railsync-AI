"""FastAPI orchestration and SQLite persistence for RailSync AI."""

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.ingest import unified_maintenance_tasks
from backend.timetable import corridor_capacity_map, timetable_windows_from_movements
from optimizer.solver import solve


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATABASE_PATH = ROOT_DIR / "backend" / "railsync.db"
DATABASE_PATH = Path(os.getenv("RAILSYNC_DATABASE_PATH", DEFAULT_DATABASE_PATH))
PLANNING_DATE = date(2026, 9, 9)
CORRIDOR_TRAFFIC = {"C1": 1.0, "C2": 0.8, "C3": 0.6, "C4": 0.5}
LOCAL_CORS_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:8080",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "null",
]


class ApprovePlanRequest(BaseModel):
    schedule_id: str


class DisruptRequest(BaseModel):
    task_id: str
    reason: str


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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
                created_at TEXT NOT NULL
            );
            """
        )
        task_count = connection.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        if task_count == 0:
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
                    for task in unified_maintenance_tasks()
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


def _supersede_current(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        UPDATE schedules SET lifecycle_status = 'superseded'
        WHERE lifecycle_status IN ('active', 'approved')
        """
    )


def _persist_schedule(
    connection: sqlite3.Connection,
    result: dict[str, Any],
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
    if scheduled_ids:
        placeholders = ",".join("?" for _ in scheduled_ids)
        connection.execute(
            f"UPDATE tasks SET status = 'scheduled' WHERE task_id IN ({placeholders})",
            scheduled_ids,
        )
    return _stored_schedule(connection, result["schedule_id"])


def _error(status_code: int, error: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": error, "detail": detail})


def _planning_inputs() -> tuple[dict[str, int], list[dict[str, str]]]:
    return corridor_capacity_map(), timetable_windows_from_movements()


def _generate_for_tasks(connection: sqlite3.Connection, tasks: list[sqlite3.Row]) -> dict[str, Any]:
    corridor_capacity, timetable_windows = _planning_inputs()
    result = solve(
        [_task_dict(task) for task in tasks],
        corridor_capacity,
        timetable_windows,
    )
    return _persist_schedule(connection, result)


def create_app() -> FastAPI:
    _connect_and_initialize()
    application = FastAPI(title="RailSync AI", version="0.2.0")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=LOCAL_CORS_ORIGINS,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
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
            rows = connection.execute(
                """
                SELECT * FROM tasks
                WHERE status IN ('pending', 'scheduled', 'approved')
                ORDER BY task_id
                """
            ).fetchall()
            return _generate_for_tasks(connection, rows)

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
            connection.execute(
                "UPDATE tasks SET status = 'overrun' WHERE task_id = ?",
                (request.task_id,),
            )
            connection.execute(
                "INSERT INTO disruptions (disruption_id, task_id, reason, created_at) VALUES (?, ?, ?, ?)",
                (f"DISRUPTION-{uuid4().hex}", request.task_id, request.reason, _utc_now()),
            )
            _refresh_task_scores(connection)
            rows = connection.execute(
                """
                SELECT * FROM tasks
                WHERE status IN ('pending', 'scheduled', 'approved')
                ORDER BY task_id
                """
            ).fetchall()
            result = _generate_for_tasks(connection, rows)
            return {
                "message": "Plan re-optimized after disruption",
                "schedule_id": result["schedule_id"],
                "reoptimization_required": True,
                "lifecycle_status": result["lifecycle_status"],
            }

    @application.get("/plan/current", response_model=None)
    def current_plan() -> dict[str, Any] | JSONResponse:
        with database() as connection:
            schedule = connection.execute(
                """
                SELECT schedule_id FROM schedules
                WHERE lifecycle_status IN ('active', 'approved')
                ORDER BY created_at DESC LIMIT 1
                """
            ).fetchone()
            if schedule is None:
                return _error(404, "No current plan", "No active or approved schedule exists")
            return _stored_schedule(connection, schedule["schedule_id"])

    data_dir = ROOT_DIR / "data"
    if data_dir.is_dir():
        application.mount("/data", StaticFiles(directory=str(data_dir)), name="data")

    return application


app = create_app()
