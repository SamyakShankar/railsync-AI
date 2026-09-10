import unittest

from backend.timetable import (
    PLANNING_WINDOW_END,
    PLANNING_WINDOW_START,
    free_maintenance_windows,
    load_train_movements,
    timetable_windows_from_movements,
)


class FreeWindowTests(unittest.TestCase):
    def test_windows_follow_occupancy_gaps(self):
        movements = [
            {
                "corridor_id": "C1",
                "start": "2026-09-09T01:20:00Z",
                "end": "2026-09-09T02:00:00Z",
            },
            {
                "corridor_id": "C1",
                "start": "2026-09-09T03:00:00Z",
                "end": "2026-09-09T03:40:00Z",
            },
            {
                "corridor_id": "C1",
                "start": "2026-09-09T05:10:00Z",
                "end": "2026-09-09T05:40:00Z",
            },
            {
                "corridor_id": "C2",
                "start": "2026-09-09T01:00:00Z",
                "end": "2026-09-09T08:00:00Z",
            },
        ]

        windows = free_maintenance_windows(
            "2026-09-09T01:00:00Z",
            "2026-09-09T08:00:00Z",
            movements,
            "C1",
        )
        self.assertEqual(
            [(window["window_start"], window["window_end"]) for window in windows],
            [
                ("2026-09-09T01:00:00Z", "2026-09-09T01:20:00Z"),
                ("2026-09-09T02:00:00Z", "2026-09-09T03:00:00Z"),
                ("2026-09-09T03:40:00Z", "2026-09-09T05:10:00Z"),
                ("2026-09-09T05:40:00Z", "2026-09-09T08:00:00Z"),
            ],
        )

    def test_touching_occupancies_are_merged(self):
        movements = [
            {
                "corridor_id": "C1",
                "start": "2026-09-09T01:20:00Z",
                "end": "2026-09-09T02:00:00Z",
            },
            {
                "corridor_id": "C1",
                "start": "2026-09-09T02:00:00Z",
                "end": "2026-09-09T02:30:00Z",
            },
        ]
        windows = free_maintenance_windows(
            "2026-09-09T01:00:00Z",
            "2026-09-09T08:00:00Z",
            movements,
            "C1",
        )
        self.assertEqual(windows[0]["window_end"], "2026-09-09T01:20:00Z")
        self.assertEqual(windows[1]["window_start"], "2026-09-09T02:30:00Z")

    def test_fully_occupied_corridor_has_no_window(self):
        movements = [
            {
                "corridor_id": "C1",
                "start": "2026-09-09T01:00:00Z",
                "end": "2026-09-09T08:00:00Z",
            }
        ]
        self.assertEqual(
            free_maintenance_windows(
                "2026-09-09T01:00:00Z",
                "2026-09-09T08:00:00Z",
                movements,
                "C1",
            ),
            [],
        )

    def test_occupancy_outside_the_base_window_is_ignored(self):
        movements = [
            {
                "corridor_id": "C1",
                "start": "2026-09-08T23:00:00Z",
                "end": "2026-09-09T01:00:00Z",
            },
            {
                "corridor_id": "C1",
                "start": "2026-09-09T08:00:00Z",
                "end": "2026-09-09T09:00:00Z",
            },
        ]
        windows = free_maintenance_windows(
            "2026-09-09T01:00:00Z",
            "2026-09-09T08:00:00Z",
            movements,
            "C1",
        )
        self.assertEqual(
            windows,
            [{
                "corridor_id": "C1",
                "window_start": "2026-09-09T01:00:00Z",
                "window_end": "2026-09-09T08:00:00Z",
            }],
        )

    def test_dataset_windows_are_derived_not_hardcoded_single_blocks(self):
        windows = timetable_windows_from_movements()
        by_corridor = {}
        for window in windows:
            by_corridor.setdefault(window["corridor_id"], []).append(window)
        self.assertEqual(set(by_corridor), {"C1", "C2", "C3", "C4"})
        for corridor_id, corridor_windows in by_corridor.items():
            self.assertGreaterEqual(len(corridor_windows), 2)
            occupancy = [
                movement
                for movement in load_train_movements()
                if movement["corridor_id"] == corridor_id
            ]
            expected = free_maintenance_windows(
                PLANNING_WINDOW_START,
                PLANNING_WINDOW_END,
                occupancy,
                corridor_id,
            )
            self.assertEqual(corridor_windows, expected)


if __name__ == "__main__":
    unittest.main()
