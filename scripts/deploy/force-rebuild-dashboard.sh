#!/bin/bash
# Force a clean dashboard rebuild from source.
# Use when uploaded .next/ doesn't seem to take effect.
#
# bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/force-rebuild-dashboard.sh

set -e

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
SITE_USER="spw-ai.com_owyn3ig1vb"
HOME_DIR="/var/www/vhosts/spw-ai.com"
DASH="$PROJECT/apps/dashboard"

cd "$PROJECT"

echo "--- 1. Verify source has the fix ---"
if grep -q 'z.union(\[z.string().email(), z.literal'\'''\''), z.null()' "$DASH/src/app/(admin)/admin/clients/[id]/edit/page.tsx" 2>/dev/null; then
  echo "  [OK] ownerEmail schema fix present in src"
else
  echo "  [FAIL] ownerEmail fix missing — re-upload apps/dashboard/src/"
  exit 1
fi

echo ""
echo "--- 2. Stop dashboard, nuke .next, fix ownership ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  . \"\$NVM_DIR/nvm.sh\"
  pm2 stop spm-dashboard 2>/dev/null
" || true
rm -rf "$DASH/.next"
chown -R "$SITE_USER:psacln" "$DASH"
echo "  [OK]"

echo ""
echo "--- 3. Rebuild (60-90s) ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm --filter @spm/dashboard build 2>&1 | tail -20
"

if [ ! -f "$DASH/.next/BUILD_ID" ]; then
  echo "  [FAIL] BUILD_ID missing — build failed"
  exit 1
fi
echo "  [OK] BUILD_ID: $(cat $DASH/.next/BUILD_ID)"

echo ""
echo "--- 4. Verify fix is IN the build ---"
if grep -rq "z.literal" "$DASH/.next/server/app/(admin)/admin/clients/[id]/edit" 2>/dev/null; then
  echo "  [OK] schema fix found in compiled output"
else
  echo "  [WARN] couldn't verify — but build succeeded"
fi

echo ""
echo "--- 5. Restart PM2 ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-dashboard
  sleep 3
  pm2 status spm-dashboard
"

echo ""
echo "Done. Hard-refresh browser (Ctrl+Shift+R) and test toggle save."
