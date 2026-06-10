#!/bin/sh
set -eu

export PGDATA="${PGDATA:-/var/lib/postgresql/data}"
mkdir -p "$PGDATA"
chown -R postgres:postgres "$PGDATA"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  gosu postgres initdb -D "$PGDATA" --username=postgres --auth-local=trust --auth-host=trust
fi

gosu postgres pg_ctl -D "$PGDATA" -o "-c listen_addresses=127.0.0.1" -w start

if ! gosu postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='wc_inspection'" | grep -q 1; then
  gosu postgres createdb wc_inspection
fi

export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg2://postgres@127.0.0.1:5432/wc_inspection}"

cd /app/backend
exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-80}"
