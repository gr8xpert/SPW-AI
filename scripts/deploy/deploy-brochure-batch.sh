#!/bin/bash
# Deploy brochure batch (items 1-7 of project_pending_deploy_batch.md).
#
# Builds API/widget/dashboard FROM SOURCE on the server so NEXT_PUBLIC_*
# env vars (e.g. NEXT_PUBLIC_API_URL) come from the server's prod .env,
# NOT from local .env.local — uploading pre-built .next would bake
# `localhost:3001` into every dashboard fetch call.
#
# Prerequisite: SFTP-upload the source manifest listed in
#   scripts/deploy/deploy-brochure-batch.MANIFEST.md
# Then SSH as root and run:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/deploy-brochure-batch.sh

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="$HOME_DIR/.nvm"
WIDGET_WEBROOT="/var/www/vhosts/spw-ai.com/httpdocs/widget"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/deploy-brochure-output.txt"

mkdir -p "$(dirname "$OUT")"
exec > >(tee "$OUT") 2>&1

echo "=== Deploy brochure batch @ $(date) ==="
echo "  PROJECT=$PROJECT"
echo ""

# ─── Step 0: Apt deps for Chromium ───────────────────────────────────────────
# Puppeteer's bundled Chromium needs these shared libs. Idempotent — apt skips
# if already installed.
echo "--- 0. System libs for Chromium (Puppeteer) ---"
DEBIAN_FRONTEND=noninteractive apt-get update >/dev/null 2>&1 || true
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2 libpango-1.0-0 libcairo2 \
  libxshmfence1 libxss1 fonts-liberation \
  >/dev/null 2>&1 || echo "  [WARN] apt install hit issues; verify manually"
echo "  [OK]"
echo ""

# ─── Step 1: Ownership ───────────────────────────────────────────────────────
echo "--- 1. Fix ownership on uploaded files ---"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/api/src" 2>/dev/null || true
chown -R "$SITE_USER:psacln" "$PROJECT/apps/dashboard/src" 2>/dev/null || true
chown -R "$SITE_USER:psacln" "$PROJECT/apps/widget/src" 2>/dev/null || true
chown -R "$SITE_USER:psacln" "$PROJECT/packages/shared/src" 2>/dev/null || true
chown "$SITE_USER:psacln" "$PROJECT/apps/api/package.json" 2>/dev/null || true
chown "$SITE_USER:psacln" "$PROJECT/pnpm-lock.yaml" 2>/dev/null || true
chown "$SITE_USER:psacln" "$PROJECT/ecosystem.config.js" 2>/dev/null || true
echo "  [OK]"
echo ""

# ─── Step 2: Stop services so the install can replace files cleanly ──────────
echo "--- 2. Stop PM2 processes ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  pm2 stop spm-api 2>/dev/null || true
  pm2 stop spm-dashboard 2>/dev/null || true
"
echo ""

# ─── Step 3: pnpm install (pulls puppeteer ~280MB Chromium binary) ───────────
echo "--- 3. pnpm install (downloads Chromium for puppeteer ~280MB on first run) ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm install --prefer-frozen-lockfile 2>&1 | tail -8
"
echo ""

# ─── Step 4: Build shared types (consumed by all 3 apps) ─────────────────────
echo "--- 4. Build @spm/shared ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter @spm/shared build 2>&1 | tail -5
"
echo ""

# ─── Step 5: Build API ───────────────────────────────────────────────────────
echo "--- 5. Build API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter api build 2>&1 | tail -8
"
test -f "$PROJECT/apps/api/dist/main.js" || { echo "[FAIL] API build — main.js missing"; exit 1; }
test -f "$PROJECT/apps/api/dist/modules/brochure/brochure.controller.js" || {
  echo "[FAIL] brochure module not in build output"; exit 1;
}
echo "  [OK] API built"
echo ""

# ─── Step 6: Build Widget ────────────────────────────────────────────────────
echo "--- 6. Build Widget ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter widget build 2>&1 | tail -8
"
test -r "$PROJECT/apps/widget/dist/spm-widget.umd.js" || { echo "[FAIL] Widget build — UMD bundle missing"; exit 1; }
echo "  [OK] Widget built"
echo ""

# ─── Step 7: Sync widget dist → public webroot ───────────────────────────────
echo "--- 7. Sync widget dist → $WIDGET_WEBROOT ---"
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
echo "  files: $(find "$WIDGET_WEBROOT" -type f | wc -l), size: $(du -sh "$WIDGET_WEBROOT" | cut -f1)"
echo ""

# ─── Step 8: Build Dashboard (with prod NEXT_PUBLIC_* baked in via server .env) ─
# CRITICAL: rebuild on server so NEXT_PUBLIC_API_URL points to prod, not localhost.
echo "--- 8. Build Dashboard ---"
rm -rf "$PROJECT/apps/dashboard/.next"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/dashboard" 2>/dev/null || true
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter @spm/dashboard build 2>&1 | tail -15
"
test -f "$PROJECT/apps/dashboard/.next/BUILD_ID" || { echo "[FAIL] Dashboard build — BUILD_ID missing"; exit 1; }
echo "  [OK] BUILD_ID: $(cat "$PROJECT/apps/dashboard/.next/BUILD_ID")"

# Sanity check: prod build must NOT have baked localhost. Look in any compiled
# server bundle for the literal string. Catches the "I forgot to set
# NEXT_PUBLIC_API_URL in the server's .env" case immediately, before users
# get a broken dashboard.
if grep -r "localhost:3001" "$PROJECT/apps/dashboard/.next/server" >/dev/null 2>&1; then
  echo "  [FAIL] localhost:3001 baked into dashboard build — check server .env for NEXT_PUBLIC_API_URL"
  exit 1
fi
echo "  [OK] no localhost:3001 in compiled output"
echo ""

# ─── Step 9: Run pending migrations ──────────────────────────────────────────
# Picks up 1776327000000-PropertyEnergyRating + 1776328000000-PropertyBrochureVariant
# if they haven't been applied yet.
echo "--- 9. Run pending migrations ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  npx --yes typeorm migration:run -d apps/api/dist/config/database.config.js 2>&1 | tail -20
"
echo ""

# ─── Step 10: Restart PM2 with new ecosystem (incl. bumped memory limit) ─────
echo "--- 10. Restart PM2 with new ecosystem config ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  # 'delete + start' picks up max_memory_restart change; a plain restart keeps
  # the old limit.
  pm2 delete spm-api 2>/dev/null || true
  pm2 start ecosystem.config.js --only spm-api --env production
  pm2 restart spm-dashboard --update-env 2>/dev/null || true
  sleep 8
  pm2 list
"
echo ""

# ─── Step 11: Smoke probes ───────────────────────────────────────────────────
echo "--- 11. Smoke probes ---"
for url in \
  "https://api.spw-ai.com/api/v1/widget-config" \
  "https://api.spw-ai.com/api/v1/sync-meta" \
  "https://spw-ai.com/widget/spm-widget.umd.js" \
; do
  code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "$url" || echo 000)
  printf '  %-60s %s\n' "GET $url" "$code"
done
# widget-config + sync-meta return 401 without API key — that's success
# (route exists, auth guard reached). 502/503/504 = bad.
echo ""

echo "=== Done @ $(date) ==="
echo ""
echo "NEXT STEPS:"
echo "  1. Pick a real tenant + property, hit:"
echo "     https://api.spw-ai.com/api/v1/properties/<REF>/brochure.pdf?lang=en&apiKey=<KEY>"
echo "  2. Visit a tenant's widget, click 'Download PDF' on a detail page."
echo "  3. In dashboard → Settings → General → Brochure, set contactEmail/Phone + default variant."
echo "  4. On a property edit page, the 'Brochure / PDF' card lets you override per-property."

chmod 644 "$OUT"
