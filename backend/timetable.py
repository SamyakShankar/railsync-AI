"""Train occupancy helpers: free maintenance windows and conflict checks."""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
PLANNING_WINDOW_START = "2026-09-09T01:00:00Z"
PLANNING_WINDOW_END = "2026-09-09T08:00:00Z"


def parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def format_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_stations() -> list[dict[str, Any]]:
    return _load_json(DATA_DIR / "stations.json")


def load_corridors() -> list[dict[str, Any]]:
    return _load_json(DATA_DIR / "corridors.json")


def load_trains() -> list[dict[str, Any]]:
    return _load_json(DATA_DIR / "trains.json")


def load_train_movements() -> list[dict[str, Any]]:
    return _load_json(DATA_DIR / "train_movements.json")


def corridor_capacity_map(corridors: list[dict[str, Any]] | None = None) -> dict[str, int]:
    if corridors is None:
        corridors = load_corridors()
    capacity = {corridor["corridor_id"]: int(corridor["capacity"]) for corridor in corridors}
    if not capacity:
        raise ValueError("Corridor list is empty")
    return capacity


def free_maintenance_windows(
    base_start: str,
    base_end: str,
    movements: list[dict[str, Any]],
    corridor_id: str,
) -> list[dict[str, str]]:
    """Subtract corridor occupancy from the base planning period."""
    period_start = parse_datetime(base_start)
    period_end = parse_datetime(base_end)
    if period_end <= period_start:
        raise ValueError("Base planning window end must be after its start")

    occupied: list[tuple[datetime, datetime]] = []
    for movement in movements:
        if movement.get("corridor_id") != corridor_id:
            continue
        start = max(parse_datetime(movement["start"]), period_start)
        end = min(parse_datetime(movement["end"]), period_end)
        if end > start:
            occupied.append((start, end))

    occupied.sort()
    merged: list[tuple[datetime, datetime]] = []
    for start, end in occupied:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    windows: list[dict[str, str]] = []
    cursor = period_start
    for start, end in merged:
        if start > cursor:
            windows.append(
                {
                    "corridor_id": corridor_id,
                    "window_start": format_datetime(cursor),
                    "window_end": format_datetime(start),
                }
            )
        cursor = max(cursor, end)
    if period_end > cursor:
        windows.append(
            {
                "corridor_id": corridor_id,
                "window_start": format_datetime(cursor),
                "window_end": format_datetime(period_end),
            }
        )
    return windows


def timetable_windows_from_movements(
    movements: list[dict[str, Any]] | None = None,
    corridors: list[dict[str, Any]] | None = None,
    base_start: str = PLANNING_WINDOW_START,
    base_end: str = PLANNING_WINDOW_END,
) -> list[dict[str, str]]:
    if movements is None:
        movements = load_train_movements()
    if corridors is None:
        corridors = load_corridors()
    windows: list[dict[str, str]] = []
    for corridor in corridors:
        windows.extend(
            free_maintenance_windows(
                base_start, base_end, movements, corridor["corridor_id"]
            )
        )
    return windows


def intervals_overlap(start_a: str, end_a: str, start_b: str, end_b: str) -> bool:
    return parse_datetime(start_a) < parse_datetime(end_b) and parse_datetime(end_a) > parse_datetime(start_b)


def block_overlaps_movement(block: dict[str, Any], movement: dict[str, Any]) -> bool:
    if block["corridor_id"] != movement["corridor_id"]:
        return False
    return intervals_overlap(
        block["block_start"], block["block_end"], movement["start"], movement["end"]
    )


def train_conflicts(
    blocks: list[dict[str, Any]],
    movements: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if movements is None:
        movements = load_train_movements()
    conflicts: list[dict[str, Any]] = []
    for block in blocks:
        for movement in movements:
            if block_overlaps_movement(block, movement):
                conflicts.append({"block": block, "movement": movement})
    return conflicts


def block_inside_free_windows(
    block: dict[str, Any],
    windows: list[dict[str, str]],
) -> bool:
    start = parse_datetime(block["block_start"])
    end = parse_datetime(block["block_end"])
    for window in windows:
        if window["corridor_id"] != block["corridor_id"]:
            continue
        window_start = parse_datetime(window["window_start"])
        window_end = parse_datetime(window["window_end"])
        if start >= window_start and end <= window_end:
            return True
    return False
