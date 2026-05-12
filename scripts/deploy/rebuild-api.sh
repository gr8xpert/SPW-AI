#!/bin/bash
# Generic API rebuild + restart (after uploading changed files via FTP)
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/rebuild-api.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
API="$PROJECT/apps/api"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/rebuild-api-output.txt"

exec > "$OUT" 2>&1

echo "=== Rebuild API $(date) ==="

echo "--- 1. Stop API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 stop spm-api 2>/dev/null
"
chown -R "$SITE_USER:psacln" "$API/src"

echo ""
echo "--- 2. Build API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm --filter api build 2>&1
"
BUILD_EXIT=$?
echo "API build exit: $BUILD_EXIT"

if [ $BUILD_EXIT -ne 0 ]; then
  echo ""
  echo "[FAIL] Build failed. NOT restarting — fix errors first."
  exit 1
fi

echo ""
echo "--- 3. Restart API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-api
  sleep 8
  pm2 status spm-api
"

echo ""
echo "--- 4. Health check ---"
curl -s -o /dev/null -w "API: %{http_code}\n" http://127.0.0.1:3001/api/health

echo ""
echo "=== Done $(date) ==="
chmod 644 "$OUT"
