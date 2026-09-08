# Optimizer

**Owner:** optimizer team.

**Must produce:** `solver.py`, which accepts the frozen Task-list, corridor-capacity, and timetable-window inputs and returns the frozen optimizer output shape. In the reviewed scaffold it returns only a hardcoded example; later work will add CP-SAT constraints.

**Do not touch outside this folder:** no backend routes, data fixtures, frontend code, or integration code. The root `requirements.txt` is the shared dependency manifest explicitly requested for this scaffold.

**Depends on:** `data/` Task entities and the optimizer input/output contract in `CONTRACTS.md`. `backend/` consumes this folder's output.
