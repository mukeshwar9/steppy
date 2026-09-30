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

# Docker mode needs the binary and a reachable daemon; otherwise local Postgres binaries are used.
use_docker() { command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; }

# Client helpers: inside the container in docker mode (no host pg tools needed), host binaries otherwise.
dc() { (cd "$ROOT" && docker compose exec -T -e PGPASSWORD=$PASSWORD postgres "$@"); }
pg_ready() {
  if use_docker; then dc pg_isready -U $USER_NAME >/dev/null 2>&1
  else PGPASSWORD=$PASSWORD pg_isready -h localhost -p $PORT -U $USER_NAME >/dev/null 2>&1; fi
}
pg_query() {
  if use_docker; then dc psql -U $USER_NAME -d postgres -tAc "$1"
  else PGPASSWORD=$PASSWORD psql -h localhost -p $PORT -U $USER_NAME -d postgres -tAc "$1"; fi
}
pg_createdb() {
  if use_docker; then dc createdb -U $USER_NAME "$1"
  else PGPASSWORD=$PASSWORD createdb -h localhost -p $PORT -U $USER_NAME "$1"; fi
}

wait_ready() {
  for _ in $(seq 1 60); do
    if pg_ready; then return 0; fi
    sleep 1
  done
  echo "Postgres did not become ready" >&2
  return 1
}

ensure_databases() {
  for db in "${DATABASES[@]}"; do
    exists=$(pg_query "SELECT 1 FROM pg_database WHERE datname='$db'" || true)
    if [ "$exists" != "1" ]; then
      pg_createdb "$db"
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
  if pg_ready; then echo "postgres accepting connections on localhost:$PORT"; return 0; fi
  echo "postgres not ready on localhost:$PORT"
  return 1
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
