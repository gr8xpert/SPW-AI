#!/bin/bash
# Option B v2 — fixes the REAL issue: /root itself is 700, so even though
# the pnpm store contents are now world-readable, the app user can't
# traverse /root to reach them.
#
# `chmod o+x` on a directory lets other users path-traverse (resolve
# /a/b/file) WITHOUT listing contents (still need +r for that). Minimal
# exposure — does NOT expose /root's contents, just lets the path resolve.
#
# Run as ROOT:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/fix-pnpm-store-v2.sh

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="$HOME_DIR/.nvm"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/fix-pnpm-store-v2-output.txt"

mkdir -p "$(dirname "$OUT")"
exec > >(tee "$OUT") 2>&1

echo "=== Fix pnpm store (v2) @ $(date) ==="
echo ""

echo "--- 1. Permissions before ---"
namei -m /root/.local/share/pnpm/store/v3/server/server.json 2>&1 | head -10
echo ""

echo "--- 2. Add traverse bit (o+x) on the path to the store ---"
# o+x = "other users can cd into / use as path component" — does NOT
# expose directory listing (that requires +r) or any file content
# (each file's own perms still apply).
chmod o+x /root
chmod o+x /root/.local
chmod o+x /root/.local/share
chmod o+x /root/.local/share/pnpm
chmod o+x /root/.local/share/pnpm/store
chmod o+x /root/.local/share/pnpm/store/v3
chmod o+x /root/.local/share/pnpm/store/v3/server 2>/dev/null || true
echo "  [OK]"
echo ""

echo "--- 3. Verify app user can now open server.json ---"
su - "$SITE_USER" -s /bin/bash -c "
  test -r /root/.local/share/pnpm/store/v3/server/server.json && echo '  [OK] readable as $SITE_USER' || echo '  [FAIL] still not readable'
"
echo ""

echo "--- 4. pnpm install ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR='$NVM_DIR'
  . \"\$NVM_DIR/nvm.sh\"
  cd '$PROJECT'
  pnpm install 2>&1 | tail -30
"
echo ""

PUPPET_PATH="$PROJECT/apps/api/node_modules/puppeteer"
if [ ! -d "$PUPPET_PATH" ]; then
  echo "[FAIL] puppeteer still not installed."
  echo "  Inspect: ls -la $PROJECT/apps/api/node_modules | head"
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
