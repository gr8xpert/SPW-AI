#!/usr/bin/env bash
# Fresh-schema migration rehearsal.
#
# Why this exists: `pnpm db:migrate` runs only the NEW migrations each
# time, so a broken dependency between migration N and an older
# migration can sit unnoticed until someone runs against a blank DB —
# which is exactly what happens on disaster recovery or a new staging
# env. This script spins up a throwaway MySQL 8 container, replays
# every migration in order, and asserts the run exits clean.
#
# Safe to run anytime. Destroys only its own container/volume.
# Requires: docker, pnpm, and `apps/api` built (scripts uses the
# compiled migration runner).

set -euo pipefail

CONTAINER_NAME="spw-migrate-rehearsal-$$"
DB_NAME="spw_migrate_rehearsal"
DB_USER="rehearsal"
DB_PASS="rehearsal-pass"
HOST_PORT="${REHEARSAL_MYSQL_PORT:-33069}"

cleanup() {
  echo ">> tearing down $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/../apps/api" && pwd)"

echo ">> starting throwaway MySQL ($CONTAINER_NAME) on :$HOST_PORT"
docker run -d \
  --name "$CONTAINER_NAME" \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE="$DB_NAME" \
  -e MYSQL_USER="$DB_USER" \
  -e MYSQL_PASSWORD="$DB_PASS" \
  -p "$HOST_PORT:3306" \
  mysql:8.0 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci \
  >/dev/null

echo ">> waiting for MySQL to accept connections (up to 60s)"
for i in $(seq 1 60); do
  if docker exec "$CONTAINER_NAME" mysqladmin ping -uroot -proot --silent >/dev/null 2>&1; then
    echo ">> MySQL is up after ${i}s"
    break
  fi
  sleep 1
  if [ "$i" = "60" ]; then
    echo "!! MySQL never became ready" >&2
    exit 1
  fi
done

# Double-check the app user can actually connect — "mysqladmin ping"
# succeeds as soon as the server socket is open, but grants may still
# be applying for a few hundred ms.
for i in $(seq 1 10); do
  if docker exec "$CONTAINER_NAME" mysql -u"$DB_USER" -p"$DB_PASS" -e "SELECT 1" "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo ">> building api (so migrations are compiled)"
pnpm --filter api build >/dev/null

echo ">> running every migration from zero against the throwaway DB"
cd "$API_DIR"
DATABASE_HOST=127.0.0.1 \
DATABASE_PORT="$HOST_PORT" \
DATABASE_USER="$DB_USER" \
DATABASE_PASSWORD="$DB_PASS" \
DATABASE_NAME="$DB_NAME" \
DATABASE_SYNCHRONIZE=false \
DATABASE_LOGGING=false \
  pnpm typeorm migration:run -d dist/config/database.config.js

echo ">> confirming the expected migration row count"
APPLIED=$(docker exec "$CONTAINER_NAME" mysql -u"$DB_USER" -p"$DB_PASS" -sN -e "SELECT COUNT(*) FROM migrations" "$DB_NAME")
EXPECTED=$(ls -1 "$API_DIR/src/database/migrations"/*.ts | wc -l | tr -d ' ')
echo ">> applied=$APPLIED  expected=$EXPECTED"
if [ "$APPLIED" != "$EXPECTED" ]; then
  echo "!! migration count mismatch — some migrations failed to register" >&2
  exit 1
fi

echo ">> all migrations replayed cleanly from zero — schema is consistent"
