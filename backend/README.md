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

If an old `backend/railsync.db` exists from before the disruption-table change, delete it and start again.

CORS is open so the frontend on another port can call these routes.

## Tests

```bash
python3 -m unittest backend.tests.test_main optimizer.tests.test_solver
```

**Depends on:** Task and schedule interfaces in `CONTRACTS.md`, sample Task data from `data/`, and the optimizer interface in `optimizer/`.
