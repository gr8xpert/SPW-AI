#!/bin/bash
# Option B v3 — fixes the WRITE access issue.
#
# v2 added traverse bits so the app user could reach the store directory,
# but pnpm needs to WRITE new tarballs into store/v3/files/ when adding
# previously-unseen packages (puppeteer, lru-cache, qrcode). The store is
# still owned by root.
#
# Fix: chown the entire store to the app user. The store contains only
# public npm tarballs (no secrets) and per server memory, the app user is
# the only user who should ever be running pnpm. Root having owned this
# was the original misconfiguration.
#
# Run as ROOT:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/fix-pnpm-store-v3.sh

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="$HOME_DIR/.nvm"
ROOT_STORE="/root/.local/share/pnpm/store"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/fix-pnpm-store-v3-output.txt"

mkdir -p "$(dirname "$OUT")"
exec > >(tee "$OUT") 2>&1

echo "=== Fix pnpm store (v3 — chown) @ $(date) ==="
echo ""

echo "--- 1. Ensure path traversal still works (from v2) ---"
chmod o+x /root /root/.local /root/.local/share 2>/dev/null || true
echo "  [OK]"
echo ""

echo "--- 2. Chown store + parent to $SITE_USER ---"
# The store directory itself + everything below. Parent dirs (.local/share/pnpm/)
# also need to be writable so pnpm can rotate/recreate subdirs.
chown -R "$SITE_USER:psacln" /root/.local/share/pnpm
echo "  [OK] $(du -sh "$ROOT_STORE" 2>/dev/null | cut -f1) handed over to $SITE_USER"
echo ""

echo "--- 3. Verify app user can now write into the store ---"
su - "$SITE_USER" -s /bin/bash -c "
  test -w '$ROOT_STORE/v3' && echo '  [OK] $ROOT_STORE/v3 writable' || echo '  [FAIL] still not writable'
  touch '$ROOT_STORE/v3/.write-probe' 2>&1
  test -f '$ROOT_STORE/v3/.write-probe' && rm '$ROOT_STORE/v3/.write-probe' && echo '  [OK] create+delete probe passed'
"
echo ""

echo "--- 4. pnpm install ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm install 2>&1 | tail -40
"
echo ""

PUPPET_PATH="$PROJECT/apps/api/node_modules/puppeteer"
if [ ! -d "$PUPPET_PATH" ]; then
  echo "[FAIL] puppeteer still not installed."
  exit 1
fi

echo "--- 5. Resolve check ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT/apps/api'
  node -e \"
    console.log('puppeteer  ->', require.resolve('puppeteer'));
    console.log('lru-cache  ->', require.resolve('lru-cache'));
    console.log('qrcode     ->', require.resolve('qrcode'));
    console.log('puppeteer  version:', require('puppeteer/package.json').version);
  \"
" || { echo "[FAIL] resolve"; exit 1; }
echo ""

echo "--- 6. Build API ---"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/api/src" 2>/dev/null || true
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
echo "  [OK]"
echo ""

echo "--- 7. Run pending migrations ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  npx --yes typeorm migration:run -d apps/api/dist/config/database.config.js 2>&1 | tail -20
"
echo ""

echo "--- 8. Restart spm-api (1.5G memory limit) ---"
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
