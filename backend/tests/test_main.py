import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient

import backend.main as backend_main
from backend.ingest import unified_maintenance_tasks
from backend.timetable import (
    block_inside_free_windows,
    timetable_windows_from_movements,
    train_conflicts,
)


class BackendApiTests(unittest.TestCase):
    def setUp(self):
        self.database_file = Path(tempfile.mktemp(suffix=".db"))
        backend_main.DATABASE_PATH = self.database_file
        self.client = TestClient(backend_main.create_app())

    def tearDown(self):
        self.database_file.unlink(missing_ok=True)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_synthetic_network_files_are_served_for_the_frontend(self):
        response = self.client.get("/data/stations.json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 6)

    def test_tasks_match_contract_schema(self):
        response = self.client.get("/tasks")
        self.assertEqual(response.status_code, 200)
        expected = {
            "task_id", "corridor_id", "department", "description", "severity",
            "estimated_duration_min", "last_maintenance_date", "priority_score", "status",
        }
        self.assertTrue(response.json())
        for task in response.json():
            self.assertEqual(set(task), expected)
            self.assertGreaterEqual(task["priority_score"], 0)
            self.assertLessEqual(task["priority_score"], 100)

    def test_generate_plan_and_no_same_corridor_overlap(self):
        response = self.client.post("/plan/generate")
        self.assertEqual(response.status_code, 200)
        plan = response.json()
        self.assertTrue(plan["schedule_id"])
        self.assertEqual(plan["lifecycle_status"], "active")
        for corridor in {block["corridor_id"] for block in plan["schedule"]}:
            blocks = sorted(
                (block for block in plan["schedule"] if block["corridor_id"] == corridor),
                key=lambda block: block["block_start"],
            )
            for first, second in zip(blocks, blocks[1:]):
                self.assertLessEqual(
                    datetime.fromisoformat(first["block_end"].replace("Z", "+00:00")),
                    datetime.fromisoformat(second["block_start"].replace("Z", "+00:00")),
                )

    def test_generate_plan_twice_keeps_schedulable_tasks_in_the_plan(self):
        first = self.client.post("/plan/generate").json()
        second = self.client.post("/plan/generate").json()

        self.assertTrue(first["schedule"])
        self.assertTrue(second["schedule"])
        self.assertNotEqual(first["schedule_id"], second["schedule_id"])
        self.assertEqual(second["lifecycle_status"], "active")

    def test_approval_rejects_unknown_schedule_id(self):
        response = self.client.post(
            "/plan/approve", json={"schedule_id": "UNKNOWN"}
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(set(response.json()), {"error", "detail"})

    def test_successful_approval(self):
        schedule_id = self.client.post("/plan/generate").json()["schedule_id"]
        response = self.client.post(
            "/plan/approve", json={"schedule_id": schedule_id}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"schedule_id": schedule_id, "lifecycle_status": "approved"},
        )
        current = self.client.get("/plan/current").json()
        self.assertEqual(current["schedule_id"], schedule_id)
        self.assertEqual(current["lifecycle_status"], "approved")

    def test_disruption_creates_new_schedule_and_updates_lifecycle(self):
        old_schedule_id = self.client.post("/plan/generate").json()["schedule_id"]
        response = self.client.post(
            "/disrupt",
            json={"task_id": "TASK-001", "reason": "Block overrun"},
        )
        self.assertEqual(response.status_code, 200)
        disruption = response.json()
        self.assertNotEqual(disruption["schedule_id"], old_schedule_id)
        self.assertEqual(disruption["lifecycle_status"], "active")
        self.assertTrue(disruption["reoptimization_required"])

        with backend_main.database() as connection:
            old = connection.execute(
                "SELECT lifecycle_status FROM schedules WHERE schedule_id = ?",
                (old_schedule_id,),
            ).fetchone()
            task = connection.execute(
                "SELECT status FROM tasks WHERE task_id = 'TASK-001'"
            ).fetchone()
        self.assertEqual(old["lifecycle_status"], "superseded")
        self.assertEqual(task["status"], "overrun")

        current = self.client.get("/plan/current").json()
        self.assertEqual(current["schedule_id"], disruption["schedule_id"])
        self.assertEqual(current["lifecycle_status"], "active")

    def test_disruption_excludes_done_tasks_from_reoptimization(self):
        with backend_main.database() as connection:
            connection.execute(
                "UPDATE tasks SET status = 'done' WHERE task_id = 'TASK-002'"
            )

        response = self.client.post(
            "/disrupt",
            json={"task_id": "TASK-001", "reason": "Block overrun"},
        )

        self.assertEqual(response.status_code, 200)
        plan = self.client.get("/plan/current").json()
        self.assertNotIn(
            "TASK-002", {block["task_id"] for block in plan["schedule"]}
        )
        with backend_main.database() as connection:
            completed_task = connection.execute(
                "SELECT status FROM tasks WHERE task_id = 'TASK-002'"
            ).fetchone()
        self.assertEqual(completed_task["status"], "done")

    def test_approved_schedule_is_superseded_by_disruption_reoptimization(self):
        old_plan = self.client.post("/plan/generate").json()
        approval = self.client.post(
            "/plan/approve", json={"schedule_id": old_plan["schedule_id"]}
        ).json()
        disruption = self.client.post(
            "/disrupt",
            json={
                "task_id": old_plan["schedule"][0]["task_id"],
                "reason": "Block overrun",
            },
        ).json()

        self.assertEqual(approval["lifecycle_status"], "approved")
        self.assertNotIn("status", approval)
        with backend_main.database() as connection:
            old = connection.execute(
                "SELECT lifecycle_status FROM schedules WHERE schedule_id = ?",
                (old_plan["schedule_id"],),
            ).fetchone()
            new = connection.execute(
                "SELECT lifecycle_status, solve_status FROM schedules WHERE schedule_id = ?",
                (disruption["schedule_id"],),
            ).fetchone()
        self.assertEqual(old["lifecycle_status"], "superseded")
        self.assertEqual(new["lifecycle_status"], "active")
        self.assertEqual(new["solve_status"], "feasible")

    def test_current_plan_returns_newest_active_or_approved_schedule(self):
        generated = self.client.post("/plan/generate").json()
        current = self.client.get("/plan/current")
        self.assertEqual(current.status_code, 200)
        self.assertEqual(current.json()["schedule_id"], generated["schedule_id"])

    def test_tasks_include_normalized_records_from_all_three_systems(self):
        response = self.client.get("/tasks")
        task_ids = {task["task_id"] for task in response.json()}
        expected_ids = {task["task_id"] for task in unified_maintenance_tasks()}
        self.assertEqual(len(response.json()), 18)
        self.assertEqual(task_ids, expected_ids)
        self.assertTrue({"TASK-001", "TASK-007", "TASK-013"}.issubset(task_ids))

    def test_generated_plan_is_train_conflict_free_and_inside_free_windows(self):
        plan = self.client.post("/plan/generate").json()
        windows = timetable_windows_from_movements()
        self.assertEqual(train_conflicts(plan["schedule"]), [])
        self.assertTrue(plan["schedule"])
        for block in plan["schedule"]:
            self.assertTrue(block_inside_free_windows(block, windows))

    def test_disruption_reoptimizes_without_train_conflicts(self):
        first = self.client.post("/plan/generate").json()
        disruption = self.client.post(
            "/disrupt",
            json={"task_id": "TASK-001", "reason": "Block overrun"},
        ).json()
        current = self.client.get("/plan/current").json()
        windows = timetable_windows_from_movements()

        self.assertNotEqual(disruption["schedule_id"], first["schedule_id"])
        self.assertEqual(train_conflicts(current["schedule"]), [])
        for block in current["schedule"]:
            self.assertTrue(block_inside_free_windows(block, windows))
        self.assertNotIn(
            "TASK-001", {block["task_id"] for block in current["schedule"]}
        )


if __name__ == "__main__":
    unittest.main()
