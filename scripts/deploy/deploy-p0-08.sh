#!/bin/bash
# P0-08 closure deploy — runs the new WebhookDeliveryChannel migration
# and restarts the API. Assumes apps/api/dist/ is already uploaded.
# Upload to: /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/deploy-p0-08.sh

set -e

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
BACKUP_DIR="$HOME_DIR/backups"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$HOME_DIR/httpdocs/deploy-p0-08-output.txt"

mkdir -p "$BACKUP_DIR"
chown "$SITE_USER" "$BACKUP_DIR" 2>/dev/null || true

{
  echo "=== P0-08 Closure Deploy — $(date) ==="
  echo ""

  echo "--- 1. Env sanity ---"
  ENV_FILE="$PROJECT/apps/api/.env"
  for v in ENCRYPTION_KEY TRUST_PROXY JWT_SECRET DATABASE_USER DATABASE_NAME; do
    grep -q "^$v=" "$ENV_FILE" && echo "  $v: present" || { echo "  $v: MISSING"; exit 1; }
  done
  echo ""

  echo "--- 2. DB backup ---"
  DB_HOST="$(grep -E '^DATABASE_HOST=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
  DB_PORT="$(grep -E '^DATABASE_PORT=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
  DB_USER="$(grep -E '^DATABASE_USER=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
  DB_PASS="$(grep -E '^DATABASE_PASSWORD=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
  DB_NAME="$(grep -E '^DATABASE_NAME=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
  : "${DB_HOST:=localhost}"
  : "${DB_PORT:=3306}"
  BACKUP_FILE="$BACKUP_DIR/pre-p0-08-$TS.sql"
  mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BACKUP_FILE"
  echo "  backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  echo ""

  echo "--- 3. Migration + restart (as $SITE_USER) ---"
  su - "$SITE_USER" -s /bin/bash -c "
    export NVM_DIR=\"$HOME_DIR/.nvm\"
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
    cd $PROJECT

    echo '-- Migrations BEFORE --'
    mysql -u $DB_USER -p$DB_PASS $DB_NAME -e \"SELECT name FROM migrations ORDER BY id DESC LIMIT 3;\" 2>&1 | grep -v '^Warning'

    echo ''
    echo '-- Running migration --'
    npx --yes typeorm migration:run -d apps/api/dist/config/database.config.js

    echo ''
    echo '-- Migrations AFTER --'
    mysql -u $DB_USER -p$DB_PASS $DB_NAME -e \"SELECT name FROM migrations ORDER BY id DESC LIMIT 3;\" 2>&1 | grep -v '^Warning'

    echo ''
    echo '-- Restarting API --'
    pm2 restart ecosystem.config.js --env production --only spm-api
    pm2 save
    sleep 5
    pm2 status
  "
  echo ""

  echo "--- 4. Boot log (last 60 lines) ---"
  su - "$SITE_USER" -s /bin/bash -c "
    export NVM_DIR=\"$HOME_DIR/.nvm\"
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
    pm2 logs spm-api --lines 60 --nostream
  "
  echo ""

  echo "=== Done — $(date) ==="
  echo "Backup:  $BACKUP_FILE"
} > "$OUT" 2>&1

chmod 644 "$OUT"
echo "Output: https://spw-ai.com/deploy-p0-08-output.txt"
