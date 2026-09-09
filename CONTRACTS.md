# Frozen Contracts —

## Task entity (data/ owns the schema, everyone else consumes it)
```json
{
  "task_id": "string",
  "corridor_id": "string",
  "department": "string",
  "work_group": "track | signalling | electrical | string",
  "description": "string",
  "severity": "int (1-5)",
  "estimated_duration_min": "int",
  "last_maintenance_date": "ISO date",
  "priority_score": "float (computed, 0-100)",
  "status": "pending | scheduled | approved | overrun | done"
}
```

`work_group` is derived from `department` so compatible gangs can share a
closure: Engineering and Track Maintenance share `track`; Signal & Telecom is
`signalling`; Electrical is `electrical`. Same group cannot overlap on one
corridor. Different groups may overlap up to that corridor's COA capacity.

## Synthetic COA (`data/coa.json`, backend serves `GET /coa`)
Demo stand-in for Control Office Application corridor availability. Not live IR
data. Shape:

```json
{
  "planning_date": "ISO date",
  "source": "synthetic-COA",
  "corridors": [
    {
      "corridor_id": "string",
      "name": "string",
      "traffic_factor": "float (0-1)",
      "capacity": "int (max parallel work groups in a block)",
      "windows": [
        {
          "window_start": "ISO datetime",
          "window_end": "ISO datetime",
          "label": "string"
        }
      ]
    }
  ]
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

Jobs that were candidates for a plan but did not get a slot are stored as
`pending`, not left as `scheduled`.

## Backend API endpoints (backend/ owns implementation, frontend/ consumes)
- `GET  /health` → `{ "status": "ok" }`
- `GET  /coa` → synthetic COA document above
- `GET  /tasks` → list of Task entities
- `POST /plan/generate` → runs optimizer and returns a generated stored schedule, including its `schedule_id` and `lifecycle_status` (see above)
- `POST /plan/approve` → body: `{ "schedule_id": "string" }` → marks that schedule as approved
- `POST /disrupt` → body: `{ "task_id": "string", "reason": "string", "overrun_min": "int, optional, default 40" }` → marks the affected task as overrun, shrinks that corridor's remaining COA window by `overrun_min` past the old block end when the task was scheduled, triggers re-optimization, and returns:
  ```json
  {
    "message": "string",
    "schedule_id": "string",
    "reoptimization_required": true,
    "lifecycle_status": "active | approved | superseded",
    "overrun_min": "int",
    "occupied_until": "ISO datetime | null"
  }
  ```
  `occupied_until` is null when the disrupted task had no block on the current plan.
- `GET  /plan/current` → latest approved/active stored schedule, including `schedule_id` and `lifecycle_status`

### Plan flow

1. **GENERATE PLAN** runs the optimizer and stores the result, returning a `schedule_id` and `lifecycle_status` of `active` with the generated schedule.
2. The frontend can display that schedule against `GET /coa` windows.
3. **APPROVE** receives the `schedule_id` and marks that schedule as approved.
4. **DISRUPT** receives a task and reason (and optional overrun minutes), marks the affected task as overrun, occupies that corridor until `block_end + overrun_min`, and causes re-optimization of the remaining jobs into the clipped windows.
5. **DISRUPT** supersedes the previous stored schedule, stores the new schedule as `active`, and returns the new `schedule_id`, `lifecycle_status`, and `reoptimization_required`.
6. The frontend fetches and displays the current plan.

## Error format (all endpoints)
```json
{"error": "string", "detail": "string"}
```
