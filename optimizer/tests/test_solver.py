import unittest
from datetime import datetime

from optimizer.solver import solve


def _task(task_id: str, duration: int, priority: float, corridor: str = "C1"):
    return {
        "task_id": task_id,
        "corridor_id": corridor,
        "estimated_duration_min": duration,
        "priority_score": priority,
    }


def _window(start: str, end: str, corridor: str = "C1"):
    return {
        "corridor_id": corridor,
        "window_start": start,
        "window_end": end,
    }


def _minutes(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class SolverTests(unittest.TestCase):
    def test_conflicting_tasks_are_not_scheduled_overlapping(self):
        result = solve(
            [_task("TASK-1", 60, 80), _task("TASK-2", 60, 70)],
            {"C1": 1},
            [_window("2026-09-09T01:00:00Z", "2026-09-09T03:00:00Z")],
        )

        blocks = result["schedule"]
        self.assertEqual(len(blocks), 2)
        first, second = sorted(blocks, key=lambda block: block["block_start"])
        self.assertLessEqual(_minutes(first["block_end"]), _minutes(second["block_start"]))

    def test_higher_priority_task_wins_when_only_one_task_fits(self):
        result = solve(
            [_task("LOW", 60, 20), _task("HIGH", 60, 90)],
            {"C1": 1},
            [_window("2026-09-09T01:00:00Z", "2026-09-09T02:00:00Z")],
        )

        self.assertEqual([block["task_id"] for block in result["schedule"]], ["HIGH"])
        self.assertEqual(result["unscheduled_task_ids"], ["LOW"])
        self.assertEqual(result["status"], "feasible")

    def test_task_that_cannot_fit_is_unscheduled_without_hard_failure(self):
        result = solve(
            [_task("TOO-LONG", 120, 100)],
            {"C1": 1},
            [_window("2026-09-09T01:00:00Z", "2026-09-09T02:00:00Z")],
        )

        self.assertEqual(result["schedule"], [])
        self.assertEqual(result["unscheduled_task_ids"], ["TOO-LONG"])
        self.assertEqual(result["status"], "feasible")

    def test_each_solve_call_returns_a_unique_schedule_id(self):
        tasks = [_task("TASK-1", 30, 50)]
        windows = [_window("2026-09-09T01:00:00Z", "2026-09-09T02:00:00Z")]

        first = solve(tasks, {"C1": 1}, windows)
        second = solve(tasks, {"C1": 1}, windows)

        self.assertNotEqual(first["schedule_id"], second["schedule_id"])

    def test_capacity_above_one_allows_parallel_blocks_up_to_capacity(self):
        result = solve(
            [_task("TASK-1", 60, 80), _task("TASK-2", 60, 70)],
            {"C1": 2},
            [_window("2026-09-09T01:00:00Z", "2026-09-09T02:00:00Z")],
        )

        self.assertEqual({block["task_id"] for block in result["schedule"]}, {"TASK-1", "TASK-2"})
        self.assertEqual(result["unscheduled_task_ids"], [])
        self.assertTrue(
            all(
                block["block_start"] == "2026-09-09T01:00:00Z"
                and block["block_end"] == "2026-09-09T02:00:00Z"
                for block in result["schedule"]
            )
        )

    def test_timetable_window_accepts_exact_fit_and_rejects_overflow(self):
        result = solve(
            [_task("EXACT", 60, 80), _task("TOO-LONG", 61, 100)],
            {"C1": 1},
            [_window("2026-09-09T01:00:00Z", "2026-09-09T02:00:00Z")],
        )

        self.assertEqual(
            result["schedule"],
            [{
                "task_id": "EXACT",
                "block_start": "2026-09-09T01:00:00Z",
                "block_end": "2026-09-09T02:00:00Z",
                "corridor_id": "C1",
            }],
        )
        self.assertEqual(result["unscheduled_task_ids"], ["TOO-LONG"])

    def test_task_must_fit_inside_a_single_free_window(self):
        result = solve(
            [_task("SPAN", 90, 100)],
            {"C1": 1},
            [
                _window("2026-09-09T01:00:00Z", "2026-09-09T02:00:00Z"),
                _window("2026-09-09T02:30:00Z", "2026-09-09T03:30:00Z"),
            ],
        )

        self.assertEqual(result["schedule"], [])
        self.assertEqual(result["unscheduled_task_ids"], ["SPAN"])
        self.assertEqual(result["status"], "feasible")

    def test_multiple_windows_schedule_without_occupying_the_gap(self):
        occupied_start = "2026-09-09T02:00:00Z"
        occupied_end = "2026-09-09T03:00:00Z"
        result = solve(
            [_task("TASK-A", 60, 90), _task("TASK-B", 60, 80)],
            {"C1": 1},
            [
                _window("2026-09-09T01:00:00Z", occupied_start),
                _window(occupied_end, "2026-09-09T05:00:00Z"),
            ],
        )

        self.assertEqual(len(result["schedule"]), 2)
        occupied_start_at = _minutes(occupied_start)
        occupied_end_at = _minutes(occupied_end)
        for block in result["schedule"]:
            start = _minutes(block["block_start"])
            end = _minutes(block["block_end"])
            self.assertFalse(start < occupied_end_at and end > occupied_start_at)

    def test_priority_still_selects_the_task_that_fits_a_short_window(self):
        result = solve(
            [_task("LOW", 30, 20), _task("HIGH", 30, 90), _task("LONG", 90, 100)],
            {"C1": 1},
            [_window("2026-09-09T01:00:00Z", "2026-09-09T01:30:00Z")],
        )

        self.assertEqual([block["task_id"] for block in result["schedule"]], ["HIGH"])
        self.assertEqual(set(result["unscheduled_task_ids"]), {"LOW", "LONG"})
