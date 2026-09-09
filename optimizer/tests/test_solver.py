import unittest
from datetime import datetime

from optimizer.solver import solve


def _task(
    task_id: str,
    duration: int,
    priority: float,
    corridor: str = "C1",
    department: str | None = None,
    work_group: str | None = None,
):
    task = {
        "task_id": task_id,
        "corridor_id": corridor,
        "estimated_duration_min": duration,
        "priority_score": priority,
    }
    if department is not None:
        task["department"] = department
    if work_group is not None:
        task["work_group"] = work_group
    return task


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

    def test_different_work_groups_can_share_a_closure(self):
        result = solve(
            [
                _task("ENG", 60, 80, work_group="track"),
                _task("SNT", 60, 70, work_group="signalling"),
            ],
            {"C1": 3},
            [_window("2026-09-09T01:00:00Z", "2026-09-09T02:00:00Z")],
        )

        self.assertEqual({block["task_id"] for block in result["schedule"]}, {"ENG", "SNT"})
        self.assertTrue(
            all(
                block["block_start"] == "2026-09-09T01:00:00Z"
                and block["block_end"] == "2026-09-09T02:00:00Z"
                for block in result["schedule"]
            )
        )

    def test_same_work_group_cannot_overlap_even_with_spare_capacity(self):
        result = solve(
            [
                _task("ENG-1", 60, 80, work_group="track"),
                _task("ENG-2", 60, 70, work_group="track"),
            ],
            {"C1": 3},
            [_window("2026-09-09T01:00:00Z", "2026-09-09T02:00:00Z")],
        )

        self.assertEqual(len(result["schedule"]), 1)
        self.assertEqual(len(result["unscheduled_task_ids"]), 1)
