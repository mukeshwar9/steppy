#!/usr/bin/env bash
# Runs a command with the repo root .env exported; falls back to .env.example when .env is missing.
# Usage: scripts/with-env.sh <cmd...>
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then
  set -a; . "$ROOT/.env"; set +a
elif [ -f "$ROOT/.env.example" ]; then
  echo "with-env: $ROOT/.env not found, using .env.example" >&2
  set -a; . "$ROOT/.env.example"; set +a
fi
exec "$@"
