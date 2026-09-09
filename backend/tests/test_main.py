import sqlite3
import tempfile
import unittest
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

import backend.main as backend_main


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

    def test_tasks_match_contract_schema(self):
        response = self.client.get("/tasks")
        self.assertEqual(response.status_code, 200)
        expected = {
            "task_id", "corridor_id", "department", "work_group", "description",
            "severity", "estimated_duration_min", "last_maintenance_date",
            "priority_score", "status",
        }
        self.assertTrue(response.json())
        for task in response.json():
            self.assertEqual(set(task), expected)
            self.assertGreaterEqual(task["priority_score"], 0)
            self.assertLessEqual(task["priority_score"], 100)

    def test_coa_endpoint_returns_synthetic_windows(self):
        response = self.client.get("/coa")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["source"], "synthetic-COA")
        corridor_ids = {corridor["corridor_id"] for corridor in payload["corridors"]}
        self.assertEqual(corridor_ids, {"C1", "C2", "C3"})
        self.assertTrue(all(corridor["capacity"] >= 2 for corridor in payload["corridors"]))

    def test_generate_plan_does_not_overlap_same_work_group(self):
        tasks = {task["task_id"]: task for task in self.client.get("/tasks").json()}
        response = self.client.post("/plan/generate")
        self.assertEqual(response.status_code, 200)
        plan = response.json()
        self.assertTrue(plan["schedule_id"])
        self.assertEqual(plan["lifecycle_status"], "active")
        grouped = defaultdict(list)
        for block in plan["schedule"]:
            grouped[(block["corridor_id"], tasks[block["task_id"]]["work_group"])].append(block)
        for blocks in grouped.values():
            ordered = sorted(blocks, key=lambda block: block["block_start"])
            for first, second in zip(ordered, ordered[1:]):
                self.assertLessEqual(
                    datetime.fromisoformat(first["block_end"].replace("Z", "+00:00")),
                    datetime.fromisoformat(second["block_start"].replace("Z", "+00:00")),
                )

    def test_generate_plan_bundles_different_departments_on_a_corridor(self):
        tasks = {task["task_id"]: task for task in self.client.get("/tasks").json()}
        plan = self.client.post("/plan/generate").json()
        overlapping_bundle = False
        by_corridor = defaultdict(list)
        for block in plan["schedule"]:
            by_corridor[block["corridor_id"]].append(block)
        for blocks in by_corridor.values():
            for first in blocks:
                first_end = datetime.fromisoformat(first["block_end"].replace("Z", "+00:00"))
                first_start = datetime.fromisoformat(first["block_start"].replace("Z", "+00:00"))
                for second in blocks:
                    if first["task_id"] >= second["task_id"]:
                        continue
                    second_start = datetime.fromisoformat(second["block_start"].replace("Z", "+00:00"))
                    second_end = datetime.fromisoformat(second["block_end"].replace("Z", "+00:00"))
                    if first_start < second_end and second_start < first_end:
                        self.assertNotEqual(
                            tasks[first["task_id"]]["work_group"],
                            tasks[second["task_id"]]["work_group"],
                        )
                        overlapping_bundle = True
        self.assertTrue(overlapping_bundle)

    def test_unscheduled_tasks_are_reset_to_pending(self):
        plan = self.client.post("/plan/generate").json()
        with backend_main.database() as connection:
            for task_id in plan["unscheduled_task_ids"]:
                row = connection.execute(
                    "SELECT status FROM tasks WHERE task_id = ?", (task_id,)
                ).fetchone()
                self.assertEqual(row["status"], "pending")

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

    def test_disruption_shrinks_remaining_corridor_window(self):
        old_plan = self.client.post("/plan/generate").json()
        target = old_plan["schedule"][0]
        block_end = datetime.fromisoformat(target["block_end"].replace("Z", "+00:00"))
        expected_until = block_end + timedelta(minutes=40)

        response = self.client.post(
            "/disrupt",
            json={
                "task_id": target["task_id"],
                "reason": "Block overrun",
                "overrun_min": 40,
            },
        )
        self.assertEqual(response.status_code, 200)
        disruption = response.json()
        self.assertEqual(disruption["overrun_min"], 40)
        self.assertEqual(
            datetime.fromisoformat(disruption["occupied_until"].replace("Z", "+00:00")),
            expected_until,
        )

        current = self.client.get("/plan/current").json()
        for block in current["schedule"]:
            if block["corridor_id"] != target["corridor_id"]:
                continue
            start = datetime.fromisoformat(block["block_start"].replace("Z", "+00:00"))
            self.assertGreaterEqual(start, expected_until)

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

    def test_reject_supersedes_plan_and_returns_jobs_to_pending(self):
        plan = self.client.post("/plan/generate").json()
        scheduled_ids = {block["task_id"] for block in plan["schedule"]}
        response = self.client.post(
            "/plan/reject", json={"schedule_id": plan["schedule_id"]}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"schedule_id": plan["schedule_id"], "lifecycle_status": "superseded"},
        )
        self.assertEqual(self.client.get("/plan/current").status_code, 404)
        tasks = {task["task_id"]: task for task in self.client.get("/tasks").json()}
        for task_id in scheduled_ids:
            self.assertEqual(tasks[task_id]["status"], "pending")

    def test_disruption_reports_plan_delta_for_the_frontend(self):
        old_plan = self.client.post("/plan/generate").json()
        target = old_plan["schedule"][0]
        disruption = self.client.post(
            "/disrupt",
            json={"task_id": target["task_id"], "reason": "Block overrun"},
        ).json()
        self.assertEqual(disruption["previous_schedule_id"], old_plan["schedule_id"])
        self.assertIn(target["task_id"], disruption["displaced_task_ids"])
        self.assertIsInstance(disruption["moved_task_ids"], list)
        self.assertIsInstance(disruption["added_task_ids"], list)

    def test_startup_migrates_legacy_disruptions_table(self):
        self.tearDown()
        self.database_file = Path(tempfile.mktemp(suffix=".db"))
        backend_main.DATABASE_PATH = self.database_file
        with sqlite3.connect(self.database_file) as connection:
            connection.executescript(
                """
                CREATE TABLE disruptions (
                    disruption_id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )
        self.client = TestClient(backend_main.create_app())
        plan = self.client.post("/plan/generate").json()
        response = self.client.post(
            "/disrupt",
            json={"task_id": plan["schedule"][0]["task_id"], "reason": "Block overrun"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("occupied_until", response.json())


if __name__ == "__main__":
    unittest.main()
