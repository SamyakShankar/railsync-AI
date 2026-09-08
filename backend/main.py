"""RailSync AI API scaffold. Business logic intentionally not implemented."""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="RailSync AI", version="0.1.0")


class ApprovePlanRequest(BaseModel):
    schedule_id: str


class DisruptRequest(BaseModel):
    task_id: str
    reason: str


PLACEHOLDER_TASKS = [{
    "task_id": "TASK-001", "corridor_id": "C1", "department": "Engineering",
    "description": "Placeholder track inspection task", "severity": 4,
    "estimated_duration_min": 60, "last_maintenance_date": "2026-07-15",
    "priority_score": 82.5, "status": "pending",
}]

PLACEHOLDER_SCHEDULE = {
    "schedule": [{
        "task_id": "TASK-001", "block_start": "2026-09-09T01:00:00Z",
        "block_end": "2026-09-09T02:00:00Z", "corridor_id": "C1",
    }],
    "unscheduled_task_ids": [], "status": "feasible",
}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/tasks")
def list_tasks() -> list[dict[str, object]]:
    """Placeholder for a list of frozen Task entities."""
    return PLACEHOLDER_TASKS


@app.post("/plan/generate")
def generate_plan() -> dict[str, object]:
    """Placeholder for the frozen optimizer schedule response."""
    return PLACEHOLDER_SCHEDULE


@app.post("/plan/approve")
def approve_plan(request: ApprovePlanRequest) -> dict[str, str]:
    """Placeholder approval acknowledgement for the submitted schedule ID."""
    return {"schedule_id": request.schedule_id, "status": "approved"}


@app.post("/disrupt")
def disrupt(request: DisruptRequest) -> dict[str, object]:
    """Placeholder disruption acknowledgement and re-optimization result."""
    return {
        "task_id": request.task_id, "reason": request.reason,
        "task_status": "overrun", "schedule": PLACEHOLDER_SCHEDULE,
    }


@app.get("/plan/current")
def current_plan() -> dict[str, object]:
    """Placeholder for the current active or approved schedule."""
    return PLACEHOLDER_SCHEDULE
