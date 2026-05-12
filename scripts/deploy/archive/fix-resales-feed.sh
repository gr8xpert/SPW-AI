#!/bin/bash
# Fix Resales-Online feed adapter — wrong p1/p2/filter param mapping
# Run as ROOT after uploading 3 files via FTP:
#   apps/api/src/database/entities/feed-config.entity.ts
#   apps/api/src/modules/feed/adapters/resales.adapter.ts
#   apps/dashboard/src/app/(dashboard)/dashboard/feeds/page.tsx
#
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/fix-resales-feed.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
API="$PROJECT/apps/api"
DASH="$PROJECT/apps/dashboard"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/fix-resales-output.txt"

exec > "$OUT" 2>&1

echo "=== Fix Resales Feed Adapter $(date) ==="

echo "--- 1. Verify uploaded files ---"
for f in \
  "$API/src/database/entities/feed-config.entity.ts" \
  "$API/src/modules/feed/adapters/resales.adapter.ts" \
  "$DASH/src/app/(dashboard)/dashboard/feeds/page.tsx"; do
  if [ -f "$f" ]; then
    echo "[OK] $(stat -c '%y %s bytes' "$f") $f"
  else
    echo "[MISSING] $f"
    exit 1
  fi
done

echo ""
echo "--- 2. Confirm fix is in place ---"
grep -n "p_agency_filterid: credentials.filterId" "$API/src/modules/feed/adapters/resales.adapter.ts" \
  || { echo "[FAIL] resales.adapter.ts not updated"; exit 1; }
grep -n "mapResalesListingType" "$API/src/modules/feed/adapters/resales.adapter.ts" \
  || { echo "[FAIL] resales.adapter.ts mapping not updated"; exit 1; }
grep -n "Filter Alias \*" "$DASH/src/app/(dashboard)/dashboard/feeds/page.tsx" \
  || { echo "[FAIL] feeds/page.tsx not updated"; exit 1; }
grep -n "filterId?: string" "$API/src/database/entities/feed-config.entity.ts" \
  || { echo "[FAIL] feed-config.entity.ts not updated"; exit 1; }

echo ""
echo "--- 3. Fix ownership ---"
chown "$SITE_USER:psacln" \
  "$API/src/database/entities/feed-config.entity.ts" \
  "$API/src/modules/feed/adapters/resales.adapter.ts" \
  "$DASH/src/app/(dashboard)/dashboard/feeds/page.tsx"
echo "[OK]"

echo ""
echo "--- 4. Stop services + clean dashboard build ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 stop spm-api spm-dashboard 2>/dev/null
"
rm -rf "$DASH/.next"
chown -R "$SITE_USER:psacln" "$DASH"
echo "[OK] Stopped"

echo ""
echo "--- 5. Rebuild API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm --filter api build 2>&1
"
echo "API build exit: $?"

echo ""
echo "--- 6. Rebuild Dashboard ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm --filter dashboard build 2>&1
"
echo "Dashboard build exit: $?"

echo ""
echo "--- 7. Restart PM2 ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-api spm-dashboard
  sleep 10
  pm2 status
"

echo ""
echo "--- 8. Health check ---"
curl -s -o /dev/null -w "API: %{http_code}\n" http://127.0.0.1:3001/api/health
curl -s -o /dev/null -w "Dashboard: %{http_code}\n" http://127.0.0.1:3000

echo ""
echo "=== Done ==="
echo "Test: dashboard > Feeds > Add Resales source with Client ID + API Key + Filter ID (e.g. 54031)"
echo "Hard refresh browser: Ctrl+Shift+R"

chmod 644 "$OUT"
