#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

exec "$ROOT_DIR/venv/bin/uvicorn" backend.main:app --host "$HOST" --port "$PORT"
