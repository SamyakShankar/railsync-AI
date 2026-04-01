# Dispatch AI Hackathon

FastAPI backend with a repo-hosted frontend for the Dispatch AI router demo.

## Run Locally

Use one command from the repo root:

```bash
./run_dispatch.sh
```

Then open:

```text
http://127.0.0.1:8000/app/
```

The API stays available at:

```text
http://127.0.0.1:8000/ask
http://127.0.0.1:8000/health
```

## Share On Your Local Network

Run with:

```bash
HOST=0.0.0.0 ./run_dispatch.sh
```

Then open this from another computer on the same Wi-Fi:

```text
http://YOUR_COMPUTER_IP:8000/app/
```

## Team Workflow

1. Push this repo to GitHub.
2. Teammates clone the repo.
3. Create a virtual environment and install dependencies:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

4. Run:

```bash
./run_dispatch.sh
```

## Important Note

GitHub helps you collaborate on the codebase, but GitHub alone does not host a live FastAPI app for everyone on the internet. For public access outside your local network, deploy the app to a real host such as Render, Railway, Fly.io, EC2, or another server.
