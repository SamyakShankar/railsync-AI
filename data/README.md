# Data

**Owner:** data team.

**Must produce:** synthetic TMS, SMMS, and TDMS Task fixtures plus the synthetic operating network:

- `tms_tasks.json`, `smms_tasks.json`, `tdms_tasks.json` — source maintenance requests
- `stations.json`, `corridors.json`, `trains.json`, `train_movements.json` — operating timetable
- `sample_data.json` — earlier combined fixture (legacy)

Normalized tasks must still match the Task entity in `CONTRACTS.md`.

**Do not touch outside this folder:** no API routes, solver logic, frontend code, or integration code.

**Depends on:** the Task entity contract in `CONTRACTS.md`. `backend/` and `optimizer/` consume these records.
