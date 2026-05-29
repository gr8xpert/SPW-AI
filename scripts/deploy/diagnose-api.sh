#!/usr/bin/env bash
# Diagnose why PM2 isn't serving the latest API dist.
#
# Usage:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/diagnose-api.sh

set -uo pipefail

SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="/var/www/vhosts/spw-ai.com/.nvm"
PM2_NAME="spm-api"
API_DIST="/var/www/vhosts/spw-ai.com/httpdocs/spw/apps/api/dist"
OUT_FILE="${OUT_FILE:-/var/www/vhosts/spw-ai.com/httpdocs/diagnose-api-output.txt}"

exec > >(tee "$OUT_FILE") 2>&1

echo "=== diagnose-api.sh @ $(date) ==="
echo

echo "--- [1] New controller present on disk? ---"
ls -la "$API_DIST/modules/tenant/public-widget-config.controller.js" 2>&1 || echo "MISSING"
echo
echo "--- [2] tenant.module.js references the new controller? ---"
grep -c "PublicWidgetConfigController" "$API_DIST/modules/tenant/tenant.module.js" 2>&1
echo "  (expected: 2 — one import, one in controllers[])"
echo

echo "--- [3] PM2 process status (what dist is it actually running?) ---"
su - "$SITE_USER" -c "export NVM_DIR='$NVM_DIR'; \
  source \"\$NVM_DIR/nvm.sh\"; \
  pm2 describe '$PM2_NAME' 2>&1 | grep -E 'script path|cwd|exec cwd|status|restart time|pid|uptime'"
echo

echo "--- [4] Restart PM2 with fresh env ---"
su - "$SITE_USER" -c "export NVM_DIR='$NVM_DIR'; \
  source \"\$NVM_DIR/nvm.sh\"; \
  pm2 restart '$PM2_NAME' --update-env"
echo

# Give Nest a moment to boot before tailing logs
sleep 3

echo "--- [5] PM2 logs (last 60 lines, includes boot) ---"
su - "$SITE_USER" -c "export NVM_DIR='$NVM_DIR'; \
  source \"\$NVM_DIR/nvm.sh\"; \
  pm2 logs '$PM2_NAME' --lines 60 --nostream 2>&1"
echo

echo "--- [6] Probe new endpoint (expect 401, not 404) ---"
code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "https://api.spw-ai.com/api/v1/widget-config")
echo "  GET /api/v1/widget-config -> HTTP $code"
echo "  (401 = route exists, auth guard reached — GOOD)"
echo "  (404 = route not registered — BAD, see logs above)"
echo

echo "--- [7] Probe similar endpoint (this is the 500 — show response) ---"
echo "  Send X-API-Key header if you want a real test;"
echo "  without it should be 401, but if 500 means 500 fires before guard."
curl -s --max-time 10 "https://api.spw-ai.com/api/v1/properties/R5378299/similar?limit=4" \
  -H "X-API-Key: dummy" || echo "  (curl failed)"
echo
echo

echo "=== Done @ $(date) ==="
