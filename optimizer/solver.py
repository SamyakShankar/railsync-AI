"""RailSync AI optimizer scaffold. Constraint solving is intentionally deferred."""

from typing import Any


def solve(
    tasks: list[dict[str, Any]],
    corridor_capacity: dict[str, int],
    timetable_windows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return the frozen optimizer output shape using a hardcoded example.

    Parameters match `CONTRACTS.md`: Task entities, a corridor-capacity map,
    and timetable windows. They are deliberately unused until CP-SAT work starts.
    """
    _ = (tasks, corridor_capacity, timetable_windows)
    return {
        "schedule": [{
            "task_id": "TASK-001", "block_start": "2026-09-09T01:00:00Z",
            "block_end": "2026-09-09T02:00:00Z", "corridor_id": "C1",
        }],
        "unscheduled_task_ids": [],
        "status": "feasible",
    }
