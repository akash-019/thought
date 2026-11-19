#!/bin/sh
# start.sh: starts the app inside the Docker image (see Dockerfile).
# - DATABASE_URL given (docker compose, or any real database): just start the app.
# - No DATABASE_URL (the Render demo): first start a Postgres inside this container.
set -e

if [ -n "$DATABASE_URL" ]; then
  exec node dist/server.js
fi

# First start (or after the disk was wiped): create an empty database.
# "trust" is safe here: this Postgres only listens inside the container (127.0.0.1).
mkdir -p "$PGDATA"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "Creating a new database..."
  initdb --username=booking --auth=trust --encoding=UTF8 >/dev/null
fi
pg_ctl --wait --log=/tmp/postgres.log --options="-c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp" start

export DATABASE_URL="postgres://booking@127.0.0.1:5432/postgres"
node dist/server.js &
APP_PID=$!

# When the container is stopped: stop the app first, then the database cleanly.
trap 'kill -TERM "$APP_PID" 2>/dev/null; wait "$APP_PID"; pg_ctl --mode=fast stop; exit 0' TERM INT
wait "$APP_PID"
pg_ctl --mode=fast stop
