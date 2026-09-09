# Optimizer

**Owner:** optimizer team.

`solver.py` places tasks in COA windows. It maximises priority score subject to:

- a task is scheduled at most once
- same work group cannot overlap on a corridor
- different work groups may share a closure up to corridor capacity
- jobs that cannot fit are returned in `unscheduled_task_ids` (still a feasible solve)

**Depends on:** `data/` Task entities and the optimizer input/output contract in `CONTRACTS.md`. `backend/` consumes this folder's output.
