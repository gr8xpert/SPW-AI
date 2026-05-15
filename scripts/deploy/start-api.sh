#!/bin/bash
# Start the API using the already-uploaded apps/api/dist/ — does NOT rebuild.
# Upload to:  /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/
# Run as root: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/start-api.sh
#
# Output is written to https://spw-ai.com/start-api-output.txt for sharing.

set -e

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
OUT="$HOME_DIR/httpdocs/start-api-output.txt"

{
  echo "=== Start API — $(date) ==="
  echo ""

  echo "--- 1. Filesystem sanity ---"
  ls -la "$PROJECT/apps/api/dist/main.js" 2>&1 || echo "MISSING: apps/api/dist/main.js"
  ls -la "$PROJECT/apps/api/.env" 2>&1 || echo "MISSING: apps/api/.env"
  echo ""

  echo "--- 2. Env vars present? ---"
  for v in ENCRYPTION_KEY TRUST_PROXY JWT_SECRET DASHBOARD_URL DATABASE_USER DATABASE_NAME; do
    if grep -q "^$v=" "$PROJECT/apps/api/.env"; then
      echo "  $v: present"
    else
      echo "  $v: MISSING"
    fi
  done
  echo ""

  echo "--- 3. Migrations table ---"
  DB_USER="$(grep -E '^DATABASE_USER=' "$PROJECT/apps/api/.env" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
  DB_PASS="$(grep -E '^DATABASE_PASSWORD=' "$PROJECT/apps/api/.env" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
  DB_NAME="$(grep -E '^DATABASE_NAME=' "$PROJECT/apps/api/.env" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
  mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e \
    "SELECT name FROM migrations ORDER BY id DESC LIMIT 8;" 2>&1
  echo ""

  echo "--- 4. Admin user exists? ---"
  mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e \
    "SELECT id, email, role, isActive FROM users WHERE email='webmaster@realtysoft.eu';" 2>&1
  echo ""

  echo "--- 5. PM2 status BEFORE ---"
  su - "$SITE_USER" -s /bin/bash -c "
    export NVM_DIR=\"$HOME_DIR/.nvm\"
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
    pm2 status
  "
  echo ""

  echo "--- 6. Starting / restarting API ---"
  su - "$SITE_USER" -s /bin/bash -c "
    export NVM_DIR=\"$HOME_DIR/.nvm\"
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
    cd $PROJECT
    pm2 delete spm-api 2>/dev/null || true
    pm2 start ecosystem.config.js --env production --only spm-api
    pm2 save
    sleep 6
    pm2 status
  "
  echo ""

  echo "--- 7. PM2 logs (last 120 lines, no stream) ---"
  su - "$SITE_USER" -s /bin/bash -c "
    export NVM_DIR=\"$HOME_DIR/.nvm\"
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
    pm2 logs spm-api --lines 120 --nostream
  "
  echo ""

  echo "=== Done — $(date) ==="
} > "$OUT" 2>&1

chmod 644 "$OUT"
echo "Output: https://spw-ai.com/start-api-output.txt"
