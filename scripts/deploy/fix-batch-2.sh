#!/bin/bash
# Fix batch 2: 4 issues from post-deploy review
#   1. PDF button position (moved out of sidebar-actions row, full-width below)
#   2. Logo URL field added to Brochure settings card
#   3. PDF brochure picks up logoUrl (no code change — once tenant saves URL)
#   4. Mortgage button — deploy tenant.service.ts mortgageCalculator flag exposure
#
# Rebuilds API + widget + dashboard. Restarts spm-api + spm-dashboard. Reminds
# about Cloudflare cache purge at the end.
#
# Run as ROOT:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/fix-batch-2.sh

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="$HOME_DIR/.nvm"
WIDGET_WEBROOT="/var/www/vhosts/spw-ai.com/httpdocs/widget"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/fix-batch-2-output.txt"

mkdir -p "$(dirname "$OUT")"
exec > >(tee "$OUT") 2>&1

echo "=== Fix batch 2 @ $(date) ==="
echo ""

echo "--- 1. Pre-flight: verify uploaded src files ---"
required=(
  "apps/api/src/modules/tenant/tenant.service.ts"
  "apps/widget/src/templates/detail/DetailTemplate01.tsx"
  "apps/widget/src/styles/components.css"
  "apps/dashboard/src/app/(dashboard)/dashboard/settings/page.tsx"
)
for f in "${required[@]}"; do
  if [ -f "$PROJECT/$f" ]; then
    echo "  [OK]   $f"
  else
    echo "  [MISS] $f"
    exit 1
  fi
done

# Sanity: confirm tenant.service.ts has the mortgageCalculator mapping
TS="$PROJECT/apps/api/src/modules/tenant/tenant.service.ts"
if ! grep -q "f.mortgageCalculator !== false" "$TS"; then
  echo "[FAIL] tenant.service.ts missing 'f.mortgageCalculator !== false' line"
  echo "  Upload the new version that exposes featureFlags to widget config."
  exit 1
fi
echo "  [OK] mortgageCalculator mapping verified in tenant.service.ts"

# Sanity: confirm settings/page.tsx has the logo URL field
SETTINGS="$PROJECT/apps/dashboard/src/app/(dashboard)/dashboard/settings/page.tsx"
if ! grep -q "brochureLogoUrl" "$SETTINGS"; then
  echo "[FAIL] settings/page.tsx missing 'brochureLogoUrl' field"
  exit 1
fi
echo "  [OK] logo URL field present in settings/page.tsx"

# Sanity: PDF button is OUTSIDE sidebar-actions in DetailTemplate01.tsx
DT="$PROJECT/apps/widget/src/templates/detail/DetailTemplate01.tsx"
if grep -B1 "RsDetailDownloadPdf" "$DT" | grep -q "rs-detail__sidebar-actions"; then
  echo "[WARN] PDF button might still be inside sidebar-actions — verify visually after deploy"
fi
echo ""

echo "--- 2. Fix ownership ---"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/api/src" 2>/dev/null || true
chown -R "$SITE_USER:psacln" "$PROJECT/apps/widget/src" 2>/dev/null || true
chown -R "$SITE_USER:psacln" "$PROJECT/apps/dashboard/src" 2>/dev/null || true
echo "  [OK]"
echo ""

echo "--- 3. Build API (tenant.service.ts change) ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter api build 2>&1 | tail -10
"
test -f "$PROJECT/apps/api/dist/modules/tenant/tenant.service.js" || { echo "[FAIL] API build"; exit 1; }
echo "  [OK]"
echo ""

echo "--- 4. Build Widget ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter widget build 2>&1 | tail -10
"
test -r "$PROJECT/apps/widget/dist/spm-widget.umd.js" || { echo "[FAIL] Widget build"; exit 1; }
echo "  [OK]"
echo ""

echo "--- 5. Sync widget → $WIDGET_WEBROOT ---"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$PROJECT/apps/widget/dist/" "$WIDGET_WEBROOT/"
else
  rm -rf "$WIDGET_WEBROOT"/*
  cp -a "$PROJECT/apps/widget/dist/." "$WIDGET_WEBROOT/"
fi
chown -R "$SITE_USER:psacln" "$WIDGET_WEBROOT" 2>/dev/null || true
find "$WIDGET_WEBROOT" -type d -exec chmod 755 {} \;
find "$WIDGET_WEBROOT" -type f -exec chmod 644 {} \;
echo "  [OK] $(find "$WIDGET_WEBROOT" -type f | wc -l) files"
echo ""

echo "--- 6. Build Dashboard ---"
rm -rf "$PROJECT/apps/dashboard/.next"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/dashboard" 2>/dev/null || true
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter @spm/dashboard build 2>&1 | tail -20
"
test -f "$PROJECT/apps/dashboard/.next/BUILD_ID" || { echo "[FAIL] Dashboard build"; exit 1; }
echo "  [OK] BUILD_ID: $(cat "$PROJECT/apps/dashboard/.next/BUILD_ID")"
if grep -r "localhost:3001" "$PROJECT/apps/dashboard/.next/server" >/dev/null 2>&1; then
  echo "  [FAIL] localhost:3001 baked into build"
  exit 1
fi
echo ""

echo "--- 7. Restart spm-api + spm-dashboard ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-api --update-env
  pm2 restart spm-dashboard --update-env
  sleep 6
  pm2 list
"
echo ""

echo "=== Done @ $(date) ==="
echo ""
echo "POST-DEPLOY (manual):"
echo ""
echo "  1. *** PURGE CLOUDFLARE ***  for these URLs:"
echo "       https://spw-ai.com/widget/spm-widget.umd.js"
echo "       https://spw-ai.com/widget/spm-widget.umd.js?ver=2.3.6"
echo "       https://spw-ai.com/widget/spm-widget.es.js"
echo "       (CF dashboard -> Caching -> Purge Cache -> Custom Purge)"
echo ""
echo "  2. In tenant dashboard -> Settings -> General -> Brochure:"
echo "       - Paste logo URL in the new field, save."
echo ""
echo "  3. In admin -> Clients -> <tenant> -> Feature Flags:"
echo "       - Make sure 'Mortgage Calculator' is ENABLED."
echo ""
echo "  4. On customer site: hard-refresh (Ctrl+Shift+R). Verify:"
echo "       - Mortgage Calculator button appears in sidebar"
echo "       - Download PDF button is BELOW Back+Features, full-width, above form"
echo "       - PDF brochure now shows the logo in the header"

chmod 644 "$OUT"
