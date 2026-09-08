# Schedule View

**Owner:** frontend schedule-view team.

**Must produce:** a Vite + React + Tailwind entry scaffold for the future schedule/Gantt review screen. No scheduling UI logic belongs here yet.

**Do not touch outside this folder:** no corridor-view code, backend routes, optimizer code, data fixtures, or integration code. Frontend-wide dependency declarations are owned by `frontend/package.json`.

**Depends on:** `GET /tasks`, `POST /plan/generate`, `POST /plan/approve`, and `GET /plan/current` contracts in `CONTRACTS.md`.
