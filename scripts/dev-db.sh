#!/usr/bin/env bash
# Local Postgres for Steppy. Usage: scripts/dev-db.sh start|stop|status|reset
# Uses docker compose when docker exists, otherwise local Postgres binaries on PATH
# (data dir .pgdata/, port 54329, user/password steppy, databases steppy and steppy_test).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="$ROOT/.pgdata"
PORT=54329
USER_NAME=steppy
PASSWORD=steppy
DATABASES=(steppy steppy_test)

use_docker() { command -v docker >/dev/null 2>&1; }

wait_ready() {
  for _ in $(seq 1 60); do
    if PGPASSWORD=$PASSWORD pg_isready -h localhost -p $PORT -U $USER_NAME >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "Postgres did not become ready" >&2
  return 1
}

ensure_databases() {
  for db in "${DATABASES[@]}"; do
    exists=$(PGPASSWORD=$PASSWORD psql -h localhost -p $PORT -U $USER_NAME -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" || true)
    if [ "$exists" != "1" ]; then
      PGPASSWORD=$PASSWORD createdb -h localhost -p $PORT -U $USER_NAME "$db"
      echo "created database $db"
    fi
  done
}

start() {
  if use_docker; then
    (cd "$ROOT" && docker compose up -d postgres)
    wait_ready
    ensure_databases
    return
  fi
  if [ ! -d "$PGDATA" ]; then
    echo "initialising $PGDATA"
    pwfile=$(mktemp)
    echo "$PASSWORD" >"$pwfile"
    initdb -D "$PGDATA" -U $USER_NAME --pwfile="$pwfile" --auth=scram-sha-256 -E UTF8 >/dev/null
    rm -f "$pwfile"
  fi
  if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    echo "postgres already running"
  else
    pg_ctl -D "$PGDATA" -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories=$PGDATA" -l "$PGDATA/server.log" -w start >/dev/null
    echo "postgres started on port $PORT"
  fi
  wait_ready
  ensure_databases
}

stop() {
  if use_docker; then
    (cd "$ROOT" && docker compose stop postgres)
  elif [ -d "$PGDATA" ] && pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null
    echo "postgres stopped"
  else
    echo "postgres not running"
  fi
}

status() {
  if PGPASSWORD=$PASSWORD pg_isready -h localhost -p $PORT -U $USER_NAME; then return 0; else return 1; fi
}

reset() {
  if use_docker; then
    (cd "$ROOT" && docker compose down -v)
  else
    stop || true
    rm -rf "$PGDATA"
  fi
  start
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  reset) reset ;;
  *) echo "usage: $0 start|stop|status|reset" >&2; exit 2 ;;
esac
