# RailSync AI — Project Context

## Identity (from PPT, verbatim facts)
- Event: Smart India Hackathon 2026
- Problem Statement ID: SIH26027
- Title: "AI-Powered Automatic Block Planning to Maximize Asset Availability
  for Train Operations on Indian Railways"
- Theme: Transportation & Logistics | Category: Software
- Team: NOVA LENS | Solution name: RailSync AI

## What the PPT claims (source of truth for the IDEA, not the build)
- Centralized optimization layer on top of existing block-planning workflows
- Ingests TMS, SMMS, TDMS maintenance data (ETL into one planning schema)
- Uses COA timetable + corridor data for traffic/demand constraints
- Maintenance Priority Score generated from task features + domain rules
- Schedules blocks under timetable, traffic, corridor-capacity constraints
- Multi-department task bundling into synchronized maintenance windows
- "Zero Overlap" safety constraint
- Human-in-the-loop: AI recommends, Section Controller approves
- "Railway Planning Digital Twin" — visualization with defect heatmaps,
  tasks, proposed schedules

## DECIDED BUILD SCOPE — this overrides the PPT's tech stack slide
We have 2 days and 6 people. The PPT's full stack (MongoDB, Redis, Celery,
Socket.io, Mapbox GL, Docker, AWS, GitHub Actions, Prophet, trained XGBoost)
is NOT the build target. Treat the items below as final.

BUILD (real, working):
- OR-Tools CP-SAT optimizer — actual constraint solving, not hardcoded output
- Rule-based priority score (weighted formula: severity, time-since-last-
  maintenance, corridor traffic) — NOT a trained ML model
- FastAPI backend, SQLite or Postgres (not MongoDB)
- React + Tailwind frontend: two screens only — Block Planning (schedule/Gantt
  + task list + generate/approve/reject/disrupt) and a simplified schematic
  corridor view (SVG/React, NOT Mapbox GL). Other nav labels are out of scope.
- Manual "re-optimize" trigger (poll/refetch, NOT Socket.io push)
- Human-in-the-loop approve/reject action on generated plans
- A disruption/overrun trigger that forces re-optimization; overrun minutes
  (default 40) keep that corridor occupied so remaining jobs use a shorter window.
  The disrupt response names which jobs moved, were added, or dropped so the UI
  can highlight the change.
- Synthetic dataset shaped like TMS/SMMS/TDMS records (no real data)
- Synthetic COA file (`data/coa.json`) for per-corridor free windows and capacity
- Multi-department bundling: different work groups may share a closure; same
  group cannot overlap on one corridor

DO NOT BUILD:
- Prophet / any forecasting model
- Any trained ML model (no real training data exists — rule-based score only)
- MongoDB, Redis, Celery, Socket.io, Docker, AWS deployment, CI/CD
- Full Mapbox GL geospatial rendering
- Any real integration with actual Indian Railways systems
- A multi-page government portal (Overview, Maintenance Requests CRUD,
  Assets & Defects, Conflict Resolution, Reports). Those are not APIs we have.
- Defect heatmaps or a "digital twin" beyond the two planning views
- Ingesting a brand-new emergency task at runtime (demo disruption is an
  overrun on an already scheduled block)

## The one demo flow every module must serve
1. Load synthetic dataset (15-20 tasks, few corridors)
2. Show priority-scored task list
3. "Generate Plan" → CP-SAT produces conflict-free block schedule
4. Controller reviews on Gantt + corridor view, approves
5. Trigger a disruption (block overrun on a scheduled job)
6. System re-optimizes, shows the new schedule, highlights the change

Nothing gets built that doesn't serve one of these six steps.