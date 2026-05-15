#!/bin/bash
# Deploy script for the P0/P1/P2/P3/CP/FP/TP fix bundle (2026-05-13).
# Upload to: /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/deploy.sh
#
# Prerequisites (must be done BEFORE running this):
#   1. Upload new builds via file manager (1:1 replace):
#        apps/api/dist/
#        apps/dashboard/.next/
#        apps/widget/dist/
#        packages/shared/dist/
#   2. Add this line to apps/api/.env on the server:
#        TRUST_PROXY=loopback
#
# What this script does:
#   - Backs up MySQL DB
#   - Sanity-checks critical env vars
#   - Stops PM2 processes
#   - Runs the 2 new migrations (TenantSecretColumns, EncryptFeedCredentials)
#   - Restarts PM2 + tails logs

set -euo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
BACKUP_DIR="$HOME_DIR/backups"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
# Use the user's default group (Plesk groups don't match the username).
chown "$SITE_USER" "$BACKUP_DIR" 2>/dev/null || true

echo "=== 1. Env sanity check ==="
ENV_FILE="$PROJECT/apps/api/.env"
test -f "$ENV_FILE" || { echo "FATAL: $ENV_FILE not found"; exit 1; }
grep -q '^ENCRYPTION_KEY=' "$ENV_FILE" || { echo "FATAL: ENCRYPTION_KEY missing in .env"; exit 1; }
grep -q '^TRUST_PROXY='    "$ENV_FILE" || { echo "FATAL: TRUST_PROXY missing — add 'TRUST_PROXY=loopback' to apps/api/.env"; exit 1; }
grep -q '^JWT_SECRET='     "$ENV_FILE" || { echo "FATAL: JWT_SECRET missing in .env"; exit 1; }
grep -q '^DASHBOARD_URL='  "$ENV_FILE" || { echo "FATAL: DASHBOARD_URL missing in .env"; exit 1; }
echo "    env OK"

echo ""
echo "=== 2. DB backup (mandatory — migrations are destructive on rollback) ==="
# Safely extract only the DB vars we need. NOT sourcing the .env — values
# with spaces/colons (HTML escapes, OpenRouter prompts, etc.) crash the shell.
get_env() {
  grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/'
}
DB_HOST="$(get_env DATABASE_HOST)"
DB_PORT="$(get_env DATABASE_PORT)"
DB_USER="$(get_env DATABASE_USER)"
DB_PASS="$(get_env DATABASE_PASSWORD)"
DB_NAME="$(get_env DATABASE_NAME)"
: "${DB_HOST:=localhost}"
: "${DB_PORT:=3306}"
[ -n "$DB_USER" ] || { echo "FATAL: DATABASE_USER empty"; exit 1; }
[ -n "$DB_NAME" ] || { echo "FATAL: DATABASE_NAME empty"; exit 1; }

BACKUP_FILE="$BACKUP_DIR/pre-p0-$TS.sql"
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BACKUP_FILE"
echo "    backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

echo ""
echo "=== 3. Migrations + PM2 restart (as $SITE_USER) ==="
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT

  echo '--- Stopping PM2 ---'
  pm2 stop ecosystem.config.js || true

  echo ''
  echo '--- Running migrations ---'
  npx --yes typeorm migration:run -d apps/api/dist/config/database.config.js

  echo ''
  echo '--- Restarting PM2 ---'
  pm2 restart ecosystem.config.js --env production
  pm2 save
  sleep 5
  pm2 status
"

echo ""
echo "=== 4. Boot log tail (look for: 'boot security audit: OK' + 'trust proxy: \"loopback\"') ==="
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 logs api --lines 60 --nostream || true
"

echo ""
echo "=== Done ==="
echo "Backup:  $BACKUP_FILE"
echo "Rollback (if needed):"
echo "  mysql -u \$DATABASE_USER -p \$DATABASE_NAME < $BACKUP_FILE"
