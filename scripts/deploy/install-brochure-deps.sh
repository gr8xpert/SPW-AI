#!/bin/bash
# Installs puppeteer + lru-cache + qrcode for the brochure module.
# Falls back through multiple strategies if the default pnpm install fails
# (per memory: workspace pnpm store ownership trap).
#
# Run as ROOT after recover-services.sh has the rest of prod online:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/install-brochure-deps.sh

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="$HOME_DIR/.nvm"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/install-brochure-deps-output.txt"

mkdir -p "$(dirname "$OUT")"
exec > >(tee "$OUT") 2>&1

echo "=== Install brochure deps @ $(date) ==="
echo ""

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

echo "--- 1. Diagnose pnpm environment ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  echo '  pnpm:    ' \$(which pnpm) '(' \$(pnpm --version) ')'
  echo '  store:   ' \$(pnpm config get store-dir)
  echo '  cache:   ' \$(pnpm config get cache-dir)
  echo '  state:   ' \$(pnpm config get state-dir)
  echo '  home:    ' \$HOME
  echo '  workspace nm linker:'
  ls -la '$PROJECT/node_modules/.pnpm' 2>/dev/null | head -3
"
echo ""

echo "--- 2. Attempt: pnpm install with FULL output (no truncation) ---"
# Captures the actual error verbatim so we can see what tryLoadServerJson hit.
INSTALL_LOG="/var/www/vhosts/spw-ai.com/httpdocs/install-attempt-full.log"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm install --reporter=ndjson 2>&1 || true
" > "$INSTALL_LOG" 2>&1
chmod 644 "$INSTALL_LOG"
echo "  Full install attempt log: https://spw-ai.com/install-attempt-full.log"

# Check if puppeteer ended up in node_modules
PUPPET_PATH="$PROJECT/apps/api/node_modules/puppeteer"
if [ -d "$PUPPET_PATH" ]; then
  echo "  [OK] puppeteer installed"
  INSTALL_OK=1
else
  echo "  [FAIL] puppeteer NOT installed via pnpm — trying fallback strategies"
  INSTALL_OK=0
fi
echo ""

# Fallback A: override pnpm store-dir to one owned by the app user.
# Per memory: workspace pnpm store was first installed by root, so symlinks
# point at /root/.local/share/pnpm/store/v3 which app user can't read.
if [ "$INSTALL_OK" = "0" ]; then
  echo "--- 3. Fallback A: pnpm install with --store-dir owned by app user ---"
  su - "$SITE_USER" -s /bin/bash -c "
    export NVM_DIR='$NVM_DIR'
    . \"\$NVM_DIR/nvm.sh\"
    mkdir -p \"\$HOME/.pnpm-store\"
    cd '$PROJECT'
    pnpm install --store-dir \"\$HOME/.pnpm-store\" 2>&1 | tail -30
  "
  if [ -d "$PUPPET_PATH" ]; then
    echo "  [OK] Fallback A succeeded"
    INSTALL_OK=1
  else
    echo "  [FAIL] Fallback A also failed"
  fi
  echo ""
fi

# Fallback B: filtered install — only the API package, with all transitive deps.
# Bypasses any workspace-wide store lookup, recreates apps/api/node_modules from scratch.
if [ "$INSTALL_OK" = "0" ]; then
  echo "--- 4. Fallback B: filtered install for @api only ---"
  rm -rf "$PROJECT/apps/api/node_modules"
  chown -R "$SITE_USER:psacln" "$PROJECT/apps/api" 2>/dev/null || true
  su - "$SITE_USER" -s /bin/bash -c "
    export NVM_DIR='$NVM_DIR'
    . \"\$NVM_DIR/nvm.sh\"
    mkdir -p \"\$HOME/.pnpm-store\"
    cd '$PROJECT'
    pnpm install --filter api --store-dir \"\$HOME/.pnpm-store\" --node-linker=hoisted 2>&1 | tail -30
  "
  if [ -d "$PUPPET_PATH" ]; then
    echo "  [OK] Fallback B succeeded"
    INSTALL_OK=1
  else
    echo "  [FAIL] Fallback B also failed"
  fi
  echo ""
fi

if [ "$INSTALL_OK" = "0" ]; then
  echo "=== ABORT — puppeteer install failed all 3 strategies ==="
  echo "Inspect: https://spw-ai.com/install-attempt-full.log"
  echo "Likely cause: pnpm workspace store ownership (memory: reference_production_server_access.md)."
  echo "Manual fix may be needed (chown of /root/.local/share/pnpm/store, or full workspace reinstall as $SITE_USER)."
  exit 1
fi

echo "--- 5. Verify deps resolve as $SITE_USER ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT/apps/api'
  node -e \"
    console.log('puppeteer  ->', require.resolve('puppeteer'));
    console.log('lru-cache  ->', require.resolve('lru-cache'));
    console.log('qrcode     ->', require.resolve('qrcode'));
  \"
"
echo ""

echo "--- 6. Build API (now includes BrochureModule) ---"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/api/src" 2>/dev/null || true
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm --filter api build 2>&1 | tail -10
"
test -f "$PROJECT/apps/api/dist/modules/brochure/brochure.controller.js" || {
  echo "[FAIL] brochure module not in build output — check ts compile errors above"
  exit 1
}
echo "  [OK] API built with brochure module"
echo ""

echo "--- 7. Run pending migrations ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  npx --yes typeorm migration:run -d apps/api/dist/config/database.config.js 2>&1 | tail -20
"
echo ""

echo "--- 8. Restart spm-api with new ecosystem (1.5G memory limit for Chromium) ---"
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

echo "--- 9. Smoke probes ---"
for url in \
  "https://api.spw-ai.com/api/v1/widget-config" \
; do
  code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "$url" || echo 000)
  printf '  %-60s %s\n' "GET $url" "$code"
done
echo ""

echo "=== Done @ $(date) ==="
chmod 644 "$OUT"
