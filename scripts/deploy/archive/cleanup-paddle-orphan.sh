#!/bin/bash
# Remove orphan paddle-checkout.service.ts from server (deleted from repo 2026-05-09 during Stripe migration)
# FTP doesn't delete remote files removed from source, so it's been blocking API build.
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/cleanup-paddle-orphan.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
API="$PROJECT/apps/api"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/cleanup-paddle-output.txt"

exec > "$OUT" 2>&1

echo "=== Cleanup Paddle Orphan $(date) ==="

echo "--- 1. Find orphan paddle files in payment module ---"
ls -la "$API/src/modules/payment/" | grep -i paddle || echo "[OK] No paddle files (already clean)"

echo ""
echo "--- 2. Delete orphan paddle source files ---"
for f in "$API/src/modules/payment/paddle-checkout.service.ts" \
         "$API/src/modules/payment/paddle-webhook.controller.ts" \
         "$API/src/modules/payment/paddle-webhook.service.ts" \
         "$API/src/modules/payment/paddle-signature.ts"; do
  if [ -f "$f" ]; then
    rm "$f" && echo "[OK] Removed $f"
  fi
done

echo ""
echo "--- 3. Also delete any compiled paddle files in dist ---"
find "$API/dist/modules/payment" -name "paddle*" -type f 2>/dev/null | while read f; do
  rm "$f" && echo "[OK] Removed dist: $f"
done

echo ""
echo "--- 4. Stop API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 stop spm-api 2>/dev/null
"

echo ""
echo "--- 5. Rebuild API ---"
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
  echo "[FAIL] Build still failing. Check errors above."
  echo "Starting API anyway with previous dist (may have stale code)..."
fi

echo ""
echo "--- 6. Verify new resales adapter is in dist ---"
DIST_ADAPTER="$API/dist/modules/feed/adapters/resales.adapter.js"
if [ -f "$DIST_ADAPTER" ]; then
  ls -la "$DIST_ADAPTER"
  grep -c "mapResalesListingType" "$DIST_ADAPTER" && echo "[OK] mapResalesListingType in compiled output"
  grep -c "Resales Online:" "$DIST_ADAPTER" && echo "[OK] new error handling in compiled output"
fi

echo ""
echo "--- 7. Restart API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-api
  sleep 8
  pm2 status spm-api
"

echo ""
echo "--- 8. Health check + recent logs ---"
curl -s -o /dev/null -w "API: %{http_code}\n" http://127.0.0.1:3001/api/health
echo ""
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 logs spm-api --nostream --lines 30
"

echo ""
echo "=== Done $(date) ==="

chmod 644 "$OUT"
