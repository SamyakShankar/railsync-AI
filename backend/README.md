# Backend

**Owner:** backend team.

FastAPI app in `main.py`. It loads synthetic tasks from `data/sample_data.json`, corridor windows from `data/coa.json`, scores jobs, calls the optimizer, and stores plans in SQLite.

## Run locally

From the repo root:

```bash
python3 -m pip install -r requirements.txt
python3 -m uvicorn backend.main:app --reload --app-dir .
```

API: `http://127.0.0.1:8000`  
Docs: `http://127.0.0.1:8000/docs`

CORS defaults to local Vite ports (`RAILSYNC_CORS_ORIGINS` to override).

Older SQLite files are migrated on startup (`overrun_min` / `occupied_until` on `disruptions`). You do not need to delete `backend/railsync.db` for that change.

## Tests

```bash
python3 -m unittest backend.tests.test_main optimizer.tests.test_solver
```

**Depends on:** Task and schedule interfaces in `CONTRACTS.md`, sample Task data from `data/`, and the optimizer interface in `optimizer/`.
