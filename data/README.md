# Data

**Owner:** data team.

- `sample_data.json` — synthetic TMS/SMMS/TDMS-shaped Task fixtures
- `coa.json` — synthetic Control Office Application corridor windows, traffic, and parallel-gang capacity

Not live Indian Railways data. `backend/` loads both files. Frontend should read live values from `GET /tasks` and `GET /coa`.
