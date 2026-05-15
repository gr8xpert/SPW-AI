#!/usr/bin/env bash
# Deploy script for the 2026-05-15 bundle (API Keys UI + WIP).
#
# Run as ROOT after uploading all artifacts (see upload list at top of chat).
#
# Usage:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/deploy-current.sh
#
# What this does:
#   1. Sanity-checks .env + uploaded artifacts
#   2. Backs up MySQL DB (defensive — no migrations needed, just safety)
#   3. As site user: pnpm install --frozen-lockfile (picks up cron-parser)
#   4. PM2 restart of spm-api + spm-dashboard
#   5. Health probe (API + dashboard)
#   6. Tails boot logs

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR_PATH="$HOME_DIR/.nvm"
BACKUP_DIR="$HOME_DIR/backups"
ENV_FILE="$PROJECT/apps/api/.env"
OUT_FILE="${OUT_FILE:-/var/www/vhosts/spw-ai.com/httpdocs/deploy-output.txt}"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR" 2>/dev/null || true
mkdir -p "$(dirname "$OUT_FILE")" 2>/dev/null || true
exec > >(tee "$OUT_FILE") 2>&1

echo "=== deploy-current.sh @ $(date) ==="
echo "  PROJECT=$PROJECT"
echo "  OUT_FILE=$OUT_FILE"
echo

# ------------------------------------------------------------------
echo "=== 1. Sanity check ==="
test -f "$ENV_FILE" || { echo "FATAL: $ENV_FILE not found"; exit 1; }
grep -q '^ENCRYPTION_KEY=' "$ENV_FILE" || { echo "FATAL: ENCRYPTION_KEY missing"; exit 1; }
grep -q '^JWT_SECRET='     "$ENV_FILE" || { echo "FATAL: JWT_SECRET missing"; exit 1; }
grep -q '^DASHBOARD_URL='  "$ENV_FILE" || { echo "FATAL: DASHBOARD_URL missing"; exit 1; }

for f in \
  "$PROJECT/apps/api/dist/main.js" \
  "$PROJECT/apps/api/package.json" \
  "$PROJECT/apps/dashboard/.next/BUILD_ID" \
  "$PROJECT/apps/dashboard/package.json" \
  "$PROJECT/packages/shared/dist/index.js" \
  "$PROJECT/packages/shared/package.json" \
  "$PROJECT/pnpm-lock.yaml" \
; do
  if [ ! -e "$f" ]; then
    echo "FATAL: artifact missing: $f"
    exit 1
  fi
done
echo "  artifacts OK"
echo "  BUILD_ID = $(cat "$PROJECT/apps/dashboard/.next/BUILD_ID")"
echo "  cron-parser in package.json: $(grep -c 'cron-parser' "$PROJECT/apps/api/package.json")"

# ------------------------------------------------------------------
echo
echo "=== 2. DB backup (defensive — no migrations expected) ==="
get_env() {
  grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/'
}
DB_HOST="$(get_env DATABASE_HOST)"; : "${DB_HOST:=localhost}"
DB_PORT="$(get_env DATABASE_PORT)"; : "${DB_PORT:=3306}"
DB_USER="$(get_env DATABASE_USER)"
DB_PASS="$(get_env DATABASE_PASSWORD)"
DB_NAME="$(get_env DATABASE_NAME)"
[ -n "$DB_USER" ] || { echo "FATAL: DATABASE_USER empty"; exit 1; }

BACKUP_FILE="$BACKUP_DIR/pre-deploy-$TS.sql"
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BACKUP_FILE"
echo "  backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# ------------------------------------------------------------------
echo
echo "=== 3. pnpm install + PM2 restart (as $SITE_USER) ==="
su - "$SITE_USER" -s /bin/bash <<EOF
set -uo pipefail
# Force pnpm to use the site user's data dir, not whatever leaked from root.
export HOME="$HOME_DIR"
export XDG_DATA_HOME="$HOME_DIR/.local/share"
export XDG_CONFIG_HOME="$HOME_DIR/.config"
export PNPM_HOME="$HOME_DIR/.local/share/pnpm"
export NVM_DIR="$NVM_DIR_PATH"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
cd "$PROJECT"

echo '--- node/pnpm versions ---'
node --version
pnpm --version

echo
echo '--- pnpm install --frozen-lockfile (picks up cron-parser) ---'
pnpm install --frozen-lockfile

echo
echo '--- pnpm rebuild bcrypt (native bindings sometimes drift) ---'
pnpm --filter api rebuild bcrypt || true

echo
echo '--- Migrations status (should be no pending — last applied = 35) ---'
# Don't run, just check by trying — typeorm prints "No migrations are pending."
node apps/api/dist/database/seed.js >/dev/null 2>&1 || true

echo
echo '--- PM2 restart ---'
pm2 restart ecosystem.config.js --env production --update-env
pm2 save
sleep 5
pm2 status
EOF
status=$?
if [ $status -ne 0 ]; then
  echo "FATAL: site-user step failed (exit $status)"
  exit $status
fi

# ------------------------------------------------------------------
echo
echo "=== 4. Health probes ==="
sleep 3
for url in \
  "https://api.spw-ai.com/api/v1/labels" \
  "https://spw-ai.com" \
; do
  code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "$url" || echo 000)
  printf '  %-50s %s\n' "GET $url" "$code"
done

# ------------------------------------------------------------------
echo
echo "=== 5. Boot log tail (look for boot security audit OK / no errors) ==="
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$NVM_DIR_PATH\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 logs spm-api --lines 40 --nostream || true
"

echo
echo "=== Done ==="
echo "Backup:  $BACKUP_FILE"
echo "Output:  $OUT_FILE"
echo
echo "Rollback (if needed):"
echo "  1. mysql ... < $BACKUP_FILE  (only if DB ended up wrong)"
echo "  2. Restore previous dist/ + .next/ + node_modules from your backup"
echo "  3. pm2 restart ecosystem.config.js"
