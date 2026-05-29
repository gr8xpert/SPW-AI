#!/bin/bash
# Fix the /api/v1/widget-config 404 by uploading the missing controller +
# updated tenant.module.ts, rebuilding API, and restarting spm-api.
#
# Required uploads BEFORE running:
#   apps/api/src/modules/tenant/public-widget-config.controller.ts  (new file)
#   apps/api/src/modules/tenant/tenant.module.ts                    (registers controller)
#
# Run as ROOT:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/fix-widget-config-route.sh

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="$HOME_DIR/.nvm"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/fix-widget-config-route-output.txt"

mkdir -p "$(dirname "$OUT")"
exec > >(tee "$OUT") 2>&1

echo "=== Fix /widget-config 404 @ $(date) ==="
echo ""

echo "--- 1. Pre-flight ---"
CTRL="$PROJECT/apps/api/src/modules/tenant/public-widget-config.controller.ts"
MOD="$PROJECT/apps/api/src/modules/tenant/tenant.module.ts"

if [ ! -f "$CTRL" ]; then
  echo "[FAIL] $CTRL not uploaded"
  exit 1
fi
echo "  [OK] public-widget-config.controller.ts present"

if [ ! -f "$MOD" ]; then
  echo "[FAIL] $MOD missing"
  exit 1
fi
if ! grep -q "PublicWidgetConfigController" "$MOD"; then
  echo "[FAIL] tenant.module.ts does NOT register PublicWidgetConfigController"
  echo "  Re-upload the latest tenant.module.ts (should import + list the controller)"
  exit 1
fi
echo "  [OK] tenant.module.ts registers PublicWidgetConfigController"
echo ""

echo "--- 2. Fix ownership ---"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/api/src" 2>/dev/null || true
echo "  [OK]"
echo ""

echo "--- 3. Build API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter api build 2>&1 | tail -10
"
test -f "$PROJECT/apps/api/dist/modules/tenant/public-widget-config.controller.js" || {
  echo "[FAIL] controller missing from build output"
  exit 1
}
echo "  [OK] controller compiled into dist"
echo ""

echo "--- 4. Restart spm-api ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-api --update-env
  sleep 6
  pm2 list
"
echo ""

echo "--- 5. Smoke probe ---"
# No API key → should now respond 401 (route exists, auth fails) instead of 404 (no route).
CODE=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "https://api.spw-ai.com/api/v1/widget-config")
echo "  GET /api/v1/widget-config (no key)  ->  $CODE"
if [ "$CODE" = "401" ]; then
  echo "  [OK] route exists (401 = auth guard reached, route is registered)"
elif [ "$CODE" = "404" ]; then
  echo "  [FAIL] still 404 — route did not register. Check build log above."
  exit 1
else
  echo "  [WARN] unexpected $CODE — investigate"
fi
echo ""

echo "=== Done @ $(date) ==="
echo ""
echo "NEXT:"
echo "  1. Test with a real API key:"
echo "       curl -s 'https://api.spw-ai.com/api/v1/widget-config' -H 'x-api-key: <KEY>' | python3 -m json.tool"
echo "     Expect 'enableMortgageCalculator': true in the response."
echo ""
echo "  2. In dashboard → Settings → Cache → click 'Clear widget cache'."
echo "     (bumps syncVersion so every customer widget re-fetches config on next load)"
echo ""
echo "  3. Hard-refresh the customer property page. Mortgage Calculator button should appear."

chmod 644 "$OUT"
