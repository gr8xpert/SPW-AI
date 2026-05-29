#!/bin/bash
# Rebuilds widget + dashboard from src and syncs widget to webroot.
# Use after the API has been deployed (via fix-pnpm-store-v3.sh) to finish
# the front-end half of the brochure batch.
#
# Carry-over files from prior batches that MUST be on the server:
#   apps/widget/src/core/feature-utils.ts
#   apps/widget/src/core/data-loader.ts
#   apps/widget/src/components/detail/RsDetailEnergyRating.tsx
#   apps/widget/src/components/detail/RsDetailSpecs.tsx
#   apps/dashboard/src/app/(dashboard)/dashboard/settings/page.tsx (apostrophe-fixed)
#
# Run as ROOT:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/rebuild-widget-and-dashboard.sh

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="$HOME_DIR/.nvm"
WIDGET_WEBROOT="/var/www/vhosts/spw-ai.com/httpdocs/widget"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/rebuild-widget-dashboard-output.txt"

mkdir -p "$(dirname "$OUT")"
exec > >(tee "$OUT") 2>&1

echo "=== Rebuild widget + dashboard @ $(date) ==="
echo ""

echo "--- 1. Pre-flight: verify required src files exist + type-aligned ---"
# Per memory: widget src has 12 interlocking files in the energy-cert +
# feature-utils refactor. Uploading some but not others creates type
# mismatches (Feature[] vs number[]). Require all of them.
required=(
  "apps/widget/src/types/property.ts"
  "apps/widget/src/core/feature-utils.ts"
  "apps/widget/src/core/data-loader.ts"
  "apps/widget/src/core/url-utils.ts"
  "apps/widget/src/index.ts"
  "apps/widget/src/components/detail/RsDetailEnergyRating.tsx"
  "apps/widget/src/components/detail/RsDetailDownloadPdf.tsx"
  "apps/widget/src/components/detail/RsDetailFeatures.tsx"
  "apps/widget/src/components/detail/RsDetailRelated.tsx"
  "apps/widget/src/components/detail/RsDetailSpecs.tsx"
  "apps/widget/src/components/wishlist/RsWishlistActions.tsx"
  "apps/widget/src/components/wishlist/generate-pdf.ts"
  "apps/widget/src/templates/detail/DetailTemplate01.tsx"
  "apps/widget/src/styles/components.css"
  "apps/dashboard/src/app/(dashboard)/dashboard/settings/page.tsx"
)
missing=0
for f in "${required[@]}"; do
  if [ -f "$PROJECT/$f" ]; then
    echo "  [OK]   $f"
  else
    echo "  [MISS] $f"
    missing=$((missing+1))
  fi
done
if [ $missing -gt 0 ]; then
  echo ""
  echo "[FAIL] $missing required src file(s) missing. SFTP-upload them, then re-run."
  exit 1
fi

# Sanity: confirm the apostrophe fix landed in settings/page.tsx
SETTINGS="$PROJECT/apps/dashboard/src/app/(dashboard)/dashboard/settings/page.tsx"
if grep -q "property's brochure variant" "$SETTINGS" 2>/dev/null; then
  echo ""
  echo "[FAIL] settings/page.tsx still has unescaped apostrophe 'property's'"
  echo "  Re-upload the fixed version (says 'property brochure variant' without apostrophe)"
  exit 1
fi
echo "  [OK] apostrophe fix verified in settings/page.tsx"

# Type-alignment sanity: property.ts must declare `features: number[]`
# (NOT `Feature[]`). The new feature-utils.ts/RsDetailFeatures.tsx expect IDs.
PTS="$PROJECT/apps/widget/src/types/property.ts"
if grep -E "^\s*features:\s*Feature\[\]" "$PTS" >/dev/null 2>&1; then
  echo "[FAIL] $PTS still declares features: Feature[] — re-upload the new version (features: number[])"
  exit 1
fi
if ! grep -E "^\s*features:\s*number\[\]" "$PTS" >/dev/null 2>&1; then
  echo "[FAIL] $PTS missing the expected 'features: number[]' line"
  exit 1
fi
echo "  [OK] property.ts has features: number[]"
echo ""

echo "--- 2. Fix ownership ---"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/widget/src" 2>/dev/null || true
chown -R "$SITE_USER:psacln" "$PROJECT/apps/dashboard/src" 2>/dev/null || true
echo "  [OK]"
echo ""

echo "--- 3. Build @spm/shared (just in case types changed) ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter @spm/shared build 2>&1 | tail -5
"
echo ""

echo "--- 4. Build Widget ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter widget build 2>&1 | tail -20
"
test -r "$PROJECT/apps/widget/dist/spm-widget.umd.js" || {
  echo "[FAIL] Widget build — UMD bundle missing"
  exit 1
}
echo "  [OK] $(ls -lh "$PROJECT/apps/widget/dist/spm-widget.umd.js" | awk '{print $5}')"
echo ""

echo "--- 5. Verify the new markers are IN the built bundle ---"
# Only check markers that SURVIVE Vite minification: CSS class names + i18n
# label keys (both string literals). Component identifiers like
# 'RsDetailEnergyRating' get mangled and won't match — those are unreliable.
markers_missing=0
for m in "rs-detail-download-pdf" "detail_download_pdf" "rs-detail-energy" "rs-sidebar-mortgage-btn"; do
  if grep -q "$m" "$PROJECT/apps/widget/dist/spm-widget.umd.js" 2>/dev/null; then
    echo "  [YES] $m"
  else
    echo "  [NO ] $m"
    markers_missing=$((markers_missing+1))
  fi
done
if [ $markers_missing -gt 0 ]; then
  echo "  [WARN] $markers_missing marker(s) missing — bundle may be incomplete (not fatal, continuing)"
fi
echo ""

echo "--- 6. Sync widget dist → $WIDGET_WEBROOT ---"
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

echo "--- 7. Build Dashboard ---"
rm -rf "$PROJECT/apps/dashboard/.next"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/dashboard" 2>/dev/null || true
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter @spm/dashboard build 2>&1 | tail -30
"
test -f "$PROJECT/apps/dashboard/.next/BUILD_ID" || {
  echo "[FAIL] Dashboard build — BUILD_ID missing"
  exit 1
}
echo "  [OK] BUILD_ID: $(cat "$PROJECT/apps/dashboard/.next/BUILD_ID")"

if grep -r "localhost:3001" "$PROJECT/apps/dashboard/.next/server" >/dev/null 2>&1; then
  echo "  [FAIL] localhost:3001 baked into build — check NEXT_PUBLIC_API_URL in server .env"
  exit 1
fi
echo "  [OK] no localhost:3001 baked"
echo ""

echo "--- 8. Restart spm-dashboard ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-dashboard --update-env
  sleep 5
  pm2 list
"
echo ""

echo "--- 9. Probe deployed widget bundle for new markers ---"
sleep 2
BUNDLE_URL="https://spw-ai.com/widget/spm-widget.umd.js"
TMP=$(mktemp)
curl -s -o "$TMP" --max-time 30 "$BUNDLE_URL?t=$(date +%s)"
if [ ! -s "$TMP" ]; then
  echo "  [FAIL] couldn't fetch $BUNDLE_URL"
else
  echo "  bundle size: $(stat -c%s "$TMP" 2>/dev/null || wc -c < "$TMP") bytes"
  for m in "rs-detail-download-pdf" "detail_download_pdf" "RsDetailEnergyRating" "mortgageCalculator"; do
    if grep -q "$m" "$TMP" 2>/dev/null; then
      echo "  [YES] $m"
    else
      echo "  [NO ] $m"
    fi
  done
fi
rm -f "$TMP"
echo ""

echo "=== Done @ $(date) ==="
echo ""
echo "NEXT:"
echo "  1. On the WordPress/customer site, hard-refresh (Ctrl+Shift+R) to bypass browser cache."
echo "  2. If the site uses a caching plugin (WP Rocket, W3 Total Cache), purge it."
echo "  3. On the property detail page expect: Energy Certificate section, Mortgage Calculator button (if enabled in tenant settings), Download PDF button."

chmod 644 "$OUT"
