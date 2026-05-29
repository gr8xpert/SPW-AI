#!/bin/bash
# Option B — fixes the pnpm store ownership trap and finishes the brochure
# deploy. Use this when the default `pnpm install` fails with:
#   EACCES: permission denied, open '/root/.local/share/pnpm/store/v3/server/server.json'
#
# Strategy: chmod the existing root-owned store to be world-readable so the
# app user can resolve from it (avoids re-downloading Chromium + all
# transitive deps to a new app-user store).
#
# Prerequisite: kill any running deploy script first (Ctrl+C in the SSH
# session that started recover-services.sh or install-brochure-deps.sh).
#
# Run as ROOT:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/fix-pnpm-store-and-install.sh

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="$HOME_DIR/.nvm"
ROOT_STORE="/root/.local/share/pnpm/store"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/fix-pnpm-store-output.txt"

mkdir -p "$(dirname "$OUT")"
exec > >(tee "$OUT") 2>&1

echo "=== Fix pnpm store + install brochure deps @ $(date) ==="
echo ""

echo "--- 1. Kill any stale pnpm/puppeteer download processes ---"
pkill -f "pnpm install" 2>/dev/null || true
pkill -f "puppeteer.*install" 2>/dev/null || true
sleep 2
echo "  [OK]"
echo ""

echo "--- 2. Make root's pnpm store readable by everyone ---"
if [ -d "$ROOT_STORE" ]; then
  chmod -R a+rX "$ROOT_STORE"
  # Check the lock file specifically — it was the trip in the original error
  if [ -f "$ROOT_STORE/v3/server/server.json" ]; then
    ls -l "$ROOT_STORE/v3/server/server.json"
  fi
  echo "  [OK] $(du -sh "$ROOT_STORE" 2>/dev/null | cut -f1) total"
else
  echo "  [WARN] $ROOT_STORE missing — root pnpm store not where we expect"
fi
echo ""

echo "--- 3. Apt deps for Chromium (idempotent — skips if already installed) ---"
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2 libpango-1.0-0 libcairo2 \
  libxshmfence1 libxss1 fonts-liberation \
  >/dev/null 2>&1 || echo "  [WARN] apt install hit issues"
echo "  [OK]"
echo ""

echo "--- 4. Fix ownership on workspace src files ---"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/api/src" 2>/dev/null || true
chown "$SITE_USER:psacln" "$PROJECT/apps/api/package.json" 2>/dev/null || true
chown "$SITE_USER:psacln" "$PROJECT/pnpm-lock.yaml" 2>/dev/null || true
chown "$SITE_USER:psacln" "$PROJECT/ecosystem.config.js" 2>/dev/null || true
echo "  [OK]"
echo ""

echo "--- 5. pnpm install (now can read root's store) ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm install 2>&1 | tail -30
"
echo ""

# Verify puppeteer landed
PUPPET_PATH="$PROJECT/apps/api/node_modules/puppeteer"
if [ ! -d "$PUPPET_PATH" ]; then
  echo "[FAIL] puppeteer still not installed after store chmod."
  echo "  Check pnpm output above. May need full fallback (custom store-dir)."
  exit 1
fi
echo "--- 6. Verify deps resolve as $SITE_USER ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT/apps/api'
  node -e \"
    console.log('puppeteer  ->', require.resolve('puppeteer'));
    console.log('lru-cache  ->', require.resolve('lru-cache'));
    console.log('qrcode     ->', require.resolve('qrcode'));
    const p = require('puppeteer');
    console.log('puppeteer  version:', require('puppeteer/package.json').version);
  \"
" || { echo "[FAIL] deps don't resolve"; exit 1; }
echo "  [OK]"
echo ""

echo "--- 7. Build API (now includes BrochureModule) ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter api build 2>&1 | tail -15
"
test -f "$PROJECT/apps/api/dist/modules/brochure/brochure.controller.js" || {
  echo "[FAIL] brochure module not in build output"
  exit 1
}
echo "  [OK] API built with brochure module"
echo ""

echo "--- 8. Run pending migrations ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  npx --yes typeorm migration:run -d apps/api/dist/config/database.config.js 2>&1 | tail -20
"
echo ""

echo "--- 9. Restart spm-api with new ecosystem (1.5G memory limit for Chromium) ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pm2 delete spm-api 2>/dev/null || true
  pm2 start ecosystem.config.js --only spm-api --env production
  sleep 8
  pm2 list
"
echo ""

echo "--- 10. Smoke probes ---"
for url in \
  "https://api.spw-ai.com/api/v1/widget-config" \
  "https://api.spw-ai.com/api/v1/sync-meta" \
; do
  code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "$url" || echo 000)
  printf '  %-60s %s\n' "GET $url" "$code"
done
echo ""

echo "=== Done @ $(date) ==="
echo ""
echo "NEXT: test the brochure endpoint with a real property:"
echo "  curl -I 'https://api.spw-ai.com/api/v1/properties/<REF>/brochure.pdf?lang=en&apiKey=<KEY>'"

chmod 644 "$OUT"
