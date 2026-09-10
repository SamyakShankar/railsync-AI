"""Normalize synthetic TMS/SMMS/TDMS task files into the Task entity."""

import json
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"

TASK_FIELDS = (
    "task_id",
    "corridor_id",
    "department",
    "description",
    "severity",
    "estimated_duration_min",
    "last_maintenance_date",
    "priority_score",
    "status",
)
ALLOWED_STATUSES = {"pending", "scheduled", "approved", "overrun", "done"}
SOURCE_FILES = {
    "TMS": DATA_DIR / "tms_tasks.json",
    "SMMS": DATA_DIR / "smms_tasks.json",
    "TDMS": DATA_DIR / "tdms_tasks.json",
}


def _load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_source_tasks(source_system: str) -> list[dict[str, Any]]:
    path = SOURCE_FILES[source_system]
    records = _load_json(path)
    if not isinstance(records, list):
        raise ValueError(f"{path.name} must contain a JSON list")
    return records


def normalize_task(record: dict[str, Any], source_system: str | None = None) -> dict[str, Any]:
    missing = [field for field in TASK_FIELDS if field not in record]
    if missing:
        raise ValueError(f"Task is missing fields {missing}: {record.get('task_id')}")
    status = record["status"]
    if status not in ALLOWED_STATUSES:
        raise ValueError(f"Invalid task status {status!r}")
    severity = int(record["severity"])
    if severity < 1 or severity > 5:
        raise ValueError(f"Task {record['task_id']} severity must be 1-5")
    duration = int(record["estimated_duration_min"])
    if duration <= 0:
        raise ValueError(f"Task {record['task_id']} duration must be positive")
    task = {
        "task_id": str(record["task_id"]),
        "corridor_id": str(record["corridor_id"]),
        "department": str(record["department"]),
        "description": str(record["description"]),
        "severity": severity,
        "estimated_duration_min": duration,
        "last_maintenance_date": str(record["last_maintenance_date"]),
        "priority_score": float(record.get("priority_score") or 0.0),
        "status": status,
    }
    if source_system:
        expected = record.get("source_system")
        if expected and expected != source_system:
            raise ValueError(
                f"Task {task['task_id']} source_system {expected!r} "
                f"does not match {source_system!r}"
            )
    return task


def unified_maintenance_tasks() -> list[dict[str, Any]]:
    tasks: list[dict[str, Any]] = []
    seen: set[str] = set()
    for source_system in ("TMS", "SMMS", "TDMS"):
        for record in load_source_tasks(source_system):
            task = normalize_task(record, source_system)
            if task["task_id"] in seen:
                raise ValueError(f"Duplicate task_id {task['task_id']}")
            seen.add(task["task_id"])
            tasks.append(task)
    return tasks
