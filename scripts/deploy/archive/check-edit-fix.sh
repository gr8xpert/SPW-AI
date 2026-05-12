#!/bin/bash
# Verify the ownerEmail fix is on the server (both src and built)
# bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/check-edit-fix.sh

P="/var/www/vhosts/spw-ai.com/httpdocs/spw/apps/dashboard"
SRC="$P/src/app/(admin)/admin/clients/[id]/edit/page.tsx"
NEXT="$P/.next/server/app/(admin)/admin/clients/[id]/edit"

echo "=== 1. Source file ownerEmail line ==="
if [ -f "$SRC" ]; then
  grep -n "ownerEmail" "$SRC" | head -3
else
  echo "FILE MISSING: $SRC"
fi

echo ""
echo "=== 2. Has the fix? ==="
if grep -E "z\.union.*z\.literal" "$SRC" >/dev/null 2>&1; then
  echo "[OK] z.union/z.literal fix present"
else
  echo "[FAIL] OLD code still on server — re-upload apps/dashboard/src/"
fi

echo ""
echo "=== 3. Build output exists? ==="
if [ -d "$NEXT" ]; then
  ls -la "$NEXT" | head -10
else
  echo "Build dir missing: $NEXT"
fi

echo ""
echo "=== 4. BUILD_ID + last build time ==="
if [ -f "$P/.next/BUILD_ID" ]; then
  echo "BUILD_ID: $(cat $P/.next/BUILD_ID)"
  echo "Built: $(stat -c '%y' $P/.next/BUILD_ID)"
else
  echo "No BUILD_ID — never built"
fi

echo ""
echo "=== 5. PM2 uptime ==="
su - spw-ai.com_owyn3ig1vb -s /bin/bash -c '
  export NVM_DIR=/var/www/vhosts/spw-ai.com/.nvm
  . $NVM_DIR/nvm.sh
  pm2 list 2>/dev/null | grep -E "spm-(api|dashboard)" || pm2 list
'
