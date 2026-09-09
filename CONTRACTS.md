# Frozen Contracts — 

## Task entity (data/ owns the schema, everyone else consumes it)
```json
{
  "task_id": "string",
  "corridor_id": "string",
  "department": "string",
  "description": "string",
  "severity": "int (1-5)",
  "estimated_duration_min": "int",
  "last_maintenance_date": "ISO date",
  "priority_score": "float (computed, 0-100)",
  "status": "pending | scheduled | approved | overrun | done"
}
```

## Optimizer input/output (optimizer/ owns the solver, backend/ calls it)
INPUT: list of Task entities + corridor capacity map + timetable windows
OUTPUT:
```json
{
  "schedule_id": "string",
  "schedule": [
    {
      "task_id": "string",
      "block_start": "ISO datetime",
      "block_end": "ISO datetime",
      "corridor_id": "string"
    }
  ],
  "unscheduled_task_ids": ["string"],
  "status": "feasible | infeasible"
}
```

The optimizer `status` describes solve feasibility only. When a schedule is
stored by the backend, the stored schedule also has a separate
`lifecycle_status`: `active | approved | superseded`. These statuses must not
be conflated; a feasible schedule can later become superseded after a newer
schedule is generated.

## Backend API endpoints (backend/ owns implementation, frontend/ consumes)
- `GET  /tasks` → list of Task entities
- `POST /plan/generate` → runs optimizer and returns a generated stored schedule, including its `schedule_id` and `lifecycle_status` (see above)
- `POST /plan/approve` → body: `{ "schedule_id": "string" }` → marks that schedule as approved
- `POST /disrupt` → body: `{ "task_id": "string", "reason": "string" }` → marks the affected task as overrun, triggers re-optimization, and returns the newly generated schedule ID:
  ```json
  {
    "message": "string",
    "schedule_id": "string",
    "reoptimization_required": true,
    "lifecycle_status": "active | approved | superseded"
  }
  ```
- `GET  /plan/current` → latest approved/active stored schedule, including `schedule_id` and `lifecycle_status`

### Plan flow

1. **GENERATE PLAN** runs the optimizer and stores the result, returning a `schedule_id` and `lifecycle_status` of `active` with the generated schedule.
2. The frontend can display that schedule.
3. **APPROVE** receives the `schedule_id` and marks that schedule as approved.
4. **DISRUPT** receives a task and reason, marks the affected task as overrun, and causes re-optimization.
5. **DISRUPT** supersedes the previous stored schedule, stores the new schedule as `active`, and returns the new `schedule_id`, `lifecycle_status`, and `reoptimization_required`.
6. The frontend fetches and displays the current plan.

## Error format (all endpoints)
```json
{"error": "string", "detail": "string"}
```

