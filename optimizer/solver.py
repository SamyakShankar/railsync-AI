"""Pure CP-SAT scheduling logic for RailSync AI."""

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from ortools.sat.python import cp_model


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _format_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _window_bounds(window: dict[str, Any]) -> tuple[datetime, datetime]:
    start = window.get("window_start", window.get("start"))
    end = window.get("window_end", window.get("end"))
    if not isinstance(start, str) or not isinstance(end, str):
        raise ValueError("Timetable windows require window_start and window_end")
    start_time = _parse_datetime(start)
    end_time = _parse_datetime(end)
    if end_time <= start_time:
        raise ValueError("Timetable window end must be after its start")
    return start_time, end_time


def solve(
    tasks: list[dict[str, Any]],
    corridor_capacity: dict[str, int],
    timetable_windows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return a priority-maximizing, capacity-constrained schedule.

    Each task may be scheduled once in one of its corridor's timetable
    windows, or left unscheduled. Time is represented as integer minutes from
    the earliest timetable start so CP-SAT can model arbitrary ISO datetimes.
    """
    schedule_id = f"SCHEDULE-{uuid4().hex}"
    task_list = list(tasks)
    windows_by_corridor: dict[str, list[tuple[datetime, datetime]]] = {}
    for window in timetable_windows:
        corridor_id = window.get("corridor_id")
        if not isinstance(corridor_id, str):
            raise ValueError("Timetable windows require corridor_id")
        windows_by_corridor.setdefault(corridor_id, []).append(
            _window_bounds(window)
        )

    all_windows = [window for windows in windows_by_corridor.values() for window in windows]
    if not all_windows:
        return {
            "schedule_id": schedule_id,
            "schedule": [],
            "unscheduled_task_ids": [task["task_id"] for task in task_list],
            "status": "feasible",
        }

    origin = min(start for start, _ in all_windows)
    model = cp_model.CpModel()
    placements: dict[str, list[dict[str, Any]]] = {}
    corridor_intervals: dict[str, list[tuple[cp_model.IntervalVar, int]]] = {}

    for task_index, task in enumerate(task_list):
        task_id = task["task_id"]
        corridor_id = task["corridor_id"]
        duration = int(task["estimated_duration_min"])
        if duration <= 0:
            raise ValueError(f"Task {task_id} duration must be positive")

        task_placements: list[dict[str, Any]] = []
        for window_index, (window_start, window_end) in enumerate(
            windows_by_corridor.get(corridor_id, [])
        ):
            window_start_min = int((window_start - origin).total_seconds() // 60)
            window_end_min = int((window_end - origin).total_seconds() // 60)
            if window_end_min - window_start_min < duration:
                continue

            start = model.NewIntVar(
                window_start_min,
                window_end_min - duration,
                f"start_{task_index}_{window_index}",
            )
            end = model.NewIntVar(
                window_start_min + duration,
                window_end_min,
                f"end_{task_index}_{window_index}",
            )
            presence = model.NewBoolVar(f"scheduled_{task_index}_{window_index}")
            interval = model.NewOptionalIntervalVar(
                start, duration, end, presence,
                f"interval_{task_index}_{window_index}",
            )
            placement = {
                "start": start,
                "end": end,
                "presence": presence,
                "interval": interval,
                "window_start": window_start,
            }
            task_placements.append(placement)
            corridor_intervals.setdefault(corridor_id, []).append(
                (interval, int(corridor_capacity.get(corridor_id, 1)))
            )

        placements[task_id] = task_placements
        if task_placements:
            model.Add(sum(placement["presence"] for placement in task_placements) <= 1)

    for corridor_id, interval_entries in corridor_intervals.items():
        capacity = int(corridor_capacity.get(corridor_id, 1))
        if capacity <= 0:
            raise ValueError(f"Corridor {corridor_id} capacity must be positive")
        intervals = [interval for interval, _ in interval_entries]
        if capacity == 1:
            model.AddNoOverlap(intervals)
        else:
            model.AddCumulative(intervals, [1] * len(intervals), capacity)

    objective_terms = []
    for task in task_list:
        score = int(round(float(task.get("priority_score", 0.0)) * 1000))
        objective_terms.extend(
            score * placement["presence"]
            for placement in placements[task["task_id"]]
        )
    model.Maximize(sum(objective_terms) if objective_terms else 0)

    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    result = solver.Solve(model)
    if result not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "schedule_id": schedule_id,
            "schedule": [],
            "unscheduled_task_ids": [task["task_id"] for task in task_list],
            "status": "infeasible",
        }

    schedule = []
    scheduled_task_ids = set()
    for task in task_list:
        for placement in placements[task["task_id"]]:
            if solver.Value(placement["presence"]):
                start = origin + (solver.Value(placement["start"]) * timedelta(minutes=1))
                end = origin + (solver.Value(placement["end"]) * timedelta(minutes=1))
                schedule.append({
                    "task_id": task["task_id"],
                    "block_start": _format_datetime(start),
                    "block_end": _format_datetime(end),
                    "corridor_id": task["corridor_id"],
                })
                scheduled_task_ids.add(task["task_id"])
                break

    return {
        "schedule_id": schedule_id,
        "schedule": schedule,
        "unscheduled_task_ids": [
            task["task_id"] for task in task_list
            if task["task_id"] not in scheduled_task_ids
        ],
        "status": "feasible",
    }
