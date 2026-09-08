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
  "schedule": [
    {"task_id": "string", "block_start": "ISO datetime",
     "block_end": "ISO datetime", "corridor_id": "string"}
  ],
  "unscheduled_task_ids": ["string"],
  "status": "feasible | infeasible"
}
```

## Backend API endpoints (backend/ owns implementation, frontend/ consumes)
- `GET  /tasks` → list of Task entities
- `POST /plan/generate` → runs optimizer, returns schedule (see above)
- `POST /plan/approve` → body: {schedule_id} → marks approved
- `POST /disrupt` → body: {task_id, reason} → marks overrun, triggers re-optimize
- `GET  /plan/current` → latest approved/active schedule

## Error format (all endpoints)
```json
{"error": "string", "detail": "string"}
```

