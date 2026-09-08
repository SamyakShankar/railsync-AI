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
- React + Tailwind frontend, two views: schedule/Gantt, and a simplified
  schematic corridor view (SVG/React, NOT Mapbox GL)
- Manual "re-optimize" trigger (poll/refetch, NOT Socket.io push)
- Human-in-the-loop approve/reject action on generated plans
- A disruption/overrun trigger that forces re-optimization
- Synthetic dataset shaped like TMS/SMMS/TDMS records (no real data)

DO NOT BUILD:
- Prophet / any forecasting model
- Any trained ML model (no real training data exists — rule-based score only)
- MongoDB, Redis, Celery, Socket.io, Docker, AWS deployment, CI/CD
- Full Mapbox GL geospatial rendering
- Any real integration with actual Indian Railways systems

## The one demo flow every module must serve
1. Load synthetic dataset (15-20 tasks, few corridors)
2. Show priority-scored task list
3. "Generate Plan" → CP-SAT produces conflict-free block schedule
4. Controller reviews on Gantt + corridor view, approves
5. Trigger a disruption (block overrun / new emergency task)
6. System re-optimizes, shows the new schedule, highlights the change

Nothing gets built that doesn't serve one of these six steps.