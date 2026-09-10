import unittest

from backend.ingest import (
    TASK_FIELDS,
    load_source_tasks,
    normalize_task,
    unified_maintenance_tasks,
)
from backend.timetable import load_corridors, load_stations, load_trains


class NetworkDataTests(unittest.TestCase):
    def test_network_counts(self):
        self.assertEqual(len(load_stations()), 6)
        self.assertEqual(len(load_corridors()), 4)
        self.assertEqual(len(load_trains()), 7)
        self.assertEqual(
            {station["station_id"] for station in load_stations()},
            {"S1", "S2", "S3", "S4", "S5", "S6"},
        )
        self.assertEqual(
            {corridor["corridor_id"] for corridor in load_corridors()},
            {"C1", "C2", "C3", "C4"},
        )
        self.assertEqual(
            {train["train_id"] for train in load_trains()},
            {"TR01", "TR02", "TR03", "TR04", "TR05", "TR06", "TR07"},
        )
        self.assertTrue(all(corridor["capacity"] == 1 for corridor in load_corridors()))

    def test_source_files_each_have_six_tasks(self):
        self.assertEqual(len(load_source_tasks("TMS")), 6)
        self.assertEqual(len(load_source_tasks("SMMS")), 6)
        self.assertEqual(len(load_source_tasks("TDMS")), 6)

    def test_normalization_produces_contract_tasks(self):
        tms = load_source_tasks("TMS")
        normalized = normalize_task(tms[0], "TMS")
        self.assertEqual(set(normalized), set(TASK_FIELDS))
        self.assertNotIn("source_system", normalized)
        self.assertNotIn("work_type", normalized)

        unified = unified_maintenance_tasks()
        self.assertEqual(len(unified), 18)
        self.assertEqual(len({task["task_id"] for task in unified}), 18)
        self.assertEqual(
            {task["corridor_id"] for task in unified},
            {"C1", "C2", "C3", "C4"},
        )
        for task in unified:
            self.assertEqual(set(task), set(TASK_FIELDS))
            self.assertGreaterEqual(task["severity"], 1)
            self.assertLessEqual(task["severity"], 5)
            self.assertGreater(task["estimated_duration_min"], 0)


if __name__ == "__main__":
    unittest.main()
