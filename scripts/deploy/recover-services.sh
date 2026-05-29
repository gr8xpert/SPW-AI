#!/bin/bash
# EMERGENCY RECOVERY — brings spm-api + spm-dashboard back online after
# deploy-brochure-batch.sh failed mid-flight (services stopped, dashboard
# .next nuked).
#
# Strategy:
#   - API: restart with the OLD dist that's still on disk (pre-brochure;
#     works fine because step 5 failed to overwrite it).
#   - Widget: rebuild (now possible — feature-utils.ts uploaded).
#   - Dashboard: rebuild from src (apostrophe fix uploaded).
#
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/recover-services.sh

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="$HOME_DIR/.nvm"
WIDGET_WEBROOT="/var/www/vhosts/spw-ai.com/httpdocs/widget"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/recover-services-output.txt"

mkdir -p "$(dirname "$OUT")"
exec > >(tee "$OUT") 2>&1

echo "=== Recover services @ $(date) ==="
echo ""

echo "--- 1. Fix ownership on uploaded files ---"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/widget/src" 2>/dev/null || true
chown -R "$SITE_USER:psacln" "$PROJECT/apps/dashboard/src" 2>/dev/null || true
chown -R "$SITE_USER:psacln" "$PROJECT/packages/shared/src" 2>/dev/null || true
echo "  [OK]"
echo ""

# @spm/shared was already built successfully in the failed run, but rebuild
# defensively in case anyone re-uploaded source.
echo "--- 2. Build @spm/shared ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter @spm/shared build 2>&1 | tail -5
"
echo ""

echo "--- 3. Build Widget (verifies feature-utils.ts upload) ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter widget build 2>&1
"
test -r "$PROJECT/apps/widget/dist/spm-widget.umd.js" || {
  echo "[FAIL] Widget build still broken — feature-utils.ts probably still missing"
  echo "  Check: ls $PROJECT/apps/widget/src/core/feature-utils.ts"
  exit 1
}
echo "  [OK] Widget built"
echo ""

echo "--- 4. Sync widget dist → $WIDGET_WEBROOT ---"
mkdir -p "$WIDGET_WEBROOT"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$PROJECT/apps/widget/dist/" "$WIDGET_WEBROOT/"
else
  rm -rf "$WIDGET_WEBROOT"/*
  cp -a "$PROJECT/apps/widget/dist/." "$WIDGET_WEBROOT/"
fi
chown -R "$SITE_USER:psacln" "$WIDGET_WEBROOT" 2>/dev/null || true
find "$WIDGET_WEBROOT" -type d -exec chmod 755 {} \;
find "$WIDGET_WEBROOT" -type f -exec chmod 644 {} \;
echo "  [OK] $(find "$WIDGET_WEBROOT" -type f | wc -l) files, $(du -sh "$WIDGET_WEBROOT" | cut -f1)"
echo ""

echo "--- 5. Build Dashboard (verifies apostrophe fix upload) ---"
rm -rf "$PROJECT/apps/dashboard/.next"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/dashboard" 2>/dev/null || true
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter @spm/dashboard build 2>&1 | tail -30
"
test -f "$PROJECT/apps/dashboard/.next/BUILD_ID" || {
  echo "[FAIL] Dashboard build still broken — check upload of settings/page.tsx"
  exit 1
}
echo "  [OK] BUILD_ID: $(cat "$PROJECT/apps/dashboard/.next/BUILD_ID")"

# Sanity: confirm prod-built bundles don't have localhost:3001
if grep -r "localhost:3001" "$PROJECT/apps/dashboard/.next/server" >/dev/null 2>&1; then
  echo "  [FAIL] localhost:3001 baked into dashboard build — check NEXT_PUBLIC_API_URL in server .env"
  exit 1
fi
echo "  [OK] no localhost:3001 in compiled output"
echo ""

# NOTE: We do NOT rebuild the API here. The OLD api/dist is still on disk
# and does NOT include BrochureModule, so it'll happily start. Brochure
# endpoint will 404 until install-brochure-deps.sh runs successfully.
echo "--- 6. Restart spm-api with EXISTING dist (pre-brochure) ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pm2 delete spm-api 2>/dev/null || true
  pm2 start ecosystem.config.js --only spm-api --env production
  sleep 5
"
echo ""

echo "--- 7. Restart spm-dashboard ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-dashboard --update-env 2>/dev/null || pm2 start ecosystem.config.js --only spm-dashboard --env production
  sleep 5
  pm2 list
"
echo ""

echo "--- 8. Smoke probes ---"
for url in \
  "https://api.spw-ai.com/api/v1/widget-config" \
  "https://api.spw-ai.com/api/v1/sync-meta" \
  "https://spw-ai.com/widget/spm-widget.umd.js" \
; do
  code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "$url" || echo 000)
  printf '  %-60s %s\n' "GET $url" "$code"
done
echo ""
echo "  (widget-config + sync-meta return 401 without API key — that's success)"
echo "  (brochure.pdf endpoint will return 404 until install-brochure-deps.sh succeeds)"
echo ""

echo "=== Done @ $(date) ==="
echo ""
echo "NEXT: prod is back online with pre-brochure API. To complete the brochure"
echo "deploy, run: bash $PROJECT/scripts/deploy/install-brochure-deps.sh"

chmod 644 "$OUT"
