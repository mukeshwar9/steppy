#!/usr/bin/env bash
# Runs a command with the repo root .env exported (if present). Usage: scripts/with-env.sh <cmd...>
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then set -a; . "$ROOT/.env"; set +a; fi
exec "$@"
