#!/usr/bin/env bash
# Properly restart the site-user's PM2 and probe the new widget-config route.
# Run as ROOT:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/fix-api.sh

set -uo pipefail

SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="/var/www/vhosts/spw-ai.com/.nvm"
PM2_NAME="spm-api"
API_DIST="/var/www/vhosts/spw-ai.com/httpdocs/spw/apps/api/dist"
OUT_FILE="${OUT_FILE:-/var/www/vhosts/spw-ai.com/httpdocs/fix-api-output.txt}"

exec > >(tee "$OUT_FILE") 2>&1

echo "=== fix-api.sh @ $(date) ==="
echo

# ─── [0] Verify we are root (sudo -iu needs root) ────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "FATAL: must run as root (sudo -iu requires root). Try: sudo bash $0"
  exit 1
fi

# ─── [1] Confirm both files are on disk ──────────────────────────────────────
echo "--- [1] On-disk dist files ---"
ls -la "$API_DIST/modules/tenant/public-widget-config.controller.js" 2>&1 || echo "MISSING controller!"
ls -la "$API_DIST/modules/tenant/tenant.module.js" 2>&1 || echo "MISSING module!"
echo
echo "tenant.module.js references PublicWidgetConfigController:"
grep -c "PublicWidgetConfigController" "$API_DIST/modules/tenant/tenant.module.js" 2>&1
echo "  (expected >= 1)"
echo

# ─── [2] Kill any orphan root pm2 daemon ─────────────────────────────────────
echo "--- [2] Kill orphan root pm2 (if any) ---"
pm2 kill 2>/dev/null || true
echo

# ─── [3] Show site-user pm2 BEFORE restart ───────────────────────────────────
echo "--- [3] Site user pm2 list (before) ---"
sudo -iu "$SITE_USER" bash -lc "source '$NVM_DIR/nvm.sh' && pm2 list" 2>&1
echo

# ─── [4] Restart spm-api as site user ────────────────────────────────────────
echo "--- [4] Restart $PM2_NAME ---"
sudo -iu "$SITE_USER" bash -lc "source '$NVM_DIR/nvm.sh' && pm2 restart '$PM2_NAME' --update-env" 2>&1
echo

sleep 3

# ─── [5] Pm2 describe — see exact script path it's running ───────────────────
echo "--- [5] pm2 describe $PM2_NAME (script path + status) ---"
sudo -iu "$SITE_USER" bash -lc "source '$NVM_DIR/nvm.sh' && pm2 describe '$PM2_NAME'" 2>&1 \
  | grep -E "script path|cwd|status|restarts|uptime|pid|name|exec mode" \
  | head -20
echo

# ─── [6] Pm2 logs — show last 80 boot lines (Nest startup) ───────────────────
echo "--- [6] pm2 logs (last 80 lines — look for Nest route mapping) ---"
sudo -iu "$SITE_USER" bash -lc "source '$NVM_DIR/nvm.sh' && pm2 logs '$PM2_NAME' --lines 80 --nostream" 2>&1
echo

# ─── [7] Probe routes ────────────────────────────────────────────────────────
echo "--- [7] Endpoint probes (HEAD shows redirect chain) ---"
echo
echo "GET /api/v1/sync-meta (known-good control):"
curl -sI --max-time 10 "https://api.spw-ai.com/api/v1/sync-meta" | grep -iE "^HTTP|^location" || echo "  (no response)"
echo
echo "GET /api/v1/widget-config (the new route):"
curl -sI --max-time 10 "https://api.spw-ai.com/api/v1/widget-config" | grep -iE "^HTTP|^location" || echo "  (no response)"
echo
echo "Following redirects:"
curl -sIL --max-time 10 "https://api.spw-ai.com/api/v1/widget-config" | grep -iE "^HTTP|^location" || echo "  (no response)"
echo

echo "=== Done @ $(date) ==="
echo "Output saved to: $OUT_FILE"
