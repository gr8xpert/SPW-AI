#!/bin/bash
# Fix the dashboard's baked-in API URL and rebuild.
#
# Why: Next.js bakes NEXT_PUBLIC_* vars at BUILD time. If the dashboard
# was built somewhere with the wrong .env (e.g. local dev), the browser
# tries to hit localhost:3001 instead of api.spw-ai.com.
#
# Usage (as root):
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/fix-dashboard-api-url.sh
#
# Idempotent — safe to re-run.

set -e
set -o pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
SITE_USER="spw-ai.com_owyn3ig1vb"
HOME_DIR="/var/www/vhosts/spw-ai.com"
DASH="$PROJECT/apps/dashboard"
DASH_ENV="$DASH/.env"
DEFAULT_API_URL="https://api.spw-ai.com"
LOG="$PROJECT/fix-dashboard-api-url.log"

cd "$PROJECT"
exec > >(tee -a "$LOG") 2>&1

echo "================================================================"
echo " Fix dashboard API URL + rebuild  —  $(date)"
echo "================================================================"

# ---------------------------------------------------------------------
# 1. Check current NEXT_PUBLIC_API_URL
# ---------------------------------------------------------------------
echo ""
echo "--- 1. Current dashboard env ---"

# .env.local overrides .env in Next.js — kill it if present
if [ -f "$DASH/.env.local" ]; then
  echo "  [WARN] $DASH/.env.local exists and will override .env at build time"
  echo "  Removing it..."
  rm -f "$DASH/.env.local"
  echo "  [OK] .env.local removed"
fi

if [ ! -f "$DASH_ENV" ]; then
  echo "  [WARN] $DASH_ENV does not exist — creating empty"
  touch "$DASH_ENV"
fi

CURRENT_URL=$(grep -E "^NEXT_PUBLIC_API_URL=" "$DASH_ENV" | head -1 | cut -d= -f2- | tr -d '"' || true)
echo "  Current NEXT_PUBLIC_API_URL: ${CURRENT_URL:-(not set)}"

NEEDS_UPDATE=0
if [ -z "$CURRENT_URL" ] || [[ "$CURRENT_URL" =~ localhost ]] || [[ "$CURRENT_URL" =~ 127\.0\.0\.1 ]]; then
  NEEDS_UPDATE=1
fi

if [ $NEEDS_UPDATE -eq 1 ]; then
  echo ""
  read -r -p "  Enter the public API URL [$DEFAULT_API_URL]: " NEW_URL
  NEW_URL="${NEW_URL:-$DEFAULT_API_URL}"

  cp "$DASH_ENV" "$DASH_ENV.bak-$(date +%Y%m%d-%H%M%S)"
  if grep -q "^NEXT_PUBLIC_API_URL=" "$DASH_ENV"; then
    sed -i "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=${NEW_URL}|" "$DASH_ENV"
  else
    echo "NEXT_PUBLIC_API_URL=${NEW_URL}" >> "$DASH_ENV"
  fi

  # API_URL (server-side, used by Next.js API routes if any)
  if grep -q "^API_URL=" "$DASH_ENV"; then
    sed -i "s|^API_URL=.*|API_URL=${NEW_URL}|" "$DASH_ENV"
  else
    echo "API_URL=${NEW_URL}" >> "$DASH_ENV"
  fi

  echo "  [OK] dashboard .env updated to: $NEW_URL"
else
  echo "  [OK] NEXT_PUBLIC_API_URL looks correct ($CURRENT_URL)"
fi

# ---------------------------------------------------------------------
# 2. Stop dashboard + clean .next + fix ownership
# ---------------------------------------------------------------------
echo ""
echo "--- 2. Stop dashboard + clean .next ---"

set +e
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 stop spm-dashboard 2>/dev/null
"
set -e

rm -rf "$DASH/.next"
chown -R "$SITE_USER:psacln" "$DASH"
echo "  [OK] stopped, cleaned, ownership fixed"

# ---------------------------------------------------------------------
# 3. Rebuild dashboard
# ---------------------------------------------------------------------
echo ""
echo "--- 3. Rebuild dashboard (this takes ~60s) ---"

set +e
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm --filter @spm/dashboard build 2>&1
"
BUILD_EXIT=$?
set -e

if [ $BUILD_EXIT -ne 0 ] || [ ! -f "$DASH/.next/BUILD_ID" ]; then
  echo ""
  echo "  [FAIL] dashboard build failed (exit $BUILD_EXIT, BUILD_ID missing)"
  echo "  Inspect the error above. Common causes:"
  echo "    - missing dep: cd $PROJECT && su - $SITE_USER -c 'pnpm install --frozen-lockfile'"
  echo "    - out of memory: try NODE_OPTIONS=--max-old-space-size=2048"
  exit 1
fi
echo "  [OK] dashboard built (BUILD_ID: $(cat $DASH/.next/BUILD_ID))"

# ---------------------------------------------------------------------
# 4. Verify the new URL is baked into the build
# ---------------------------------------------------------------------
echo ""
echo "--- 4. Verify baked URL ---"

BAKED_URL=$(grep -roE 'https?://[a-zA-Z0-9./_-]+' "$DASH/.next/server" 2>/dev/null | grep -E 'api\.|/api' | head -3 || true)
LEAKED_LOCAL=$(grep -ro 'localhost:3001\|127\.0\.0\.1:3001' "$DASH/.next/server" 2>/dev/null | head -3 || true)

if [ -n "$LEAKED_LOCAL" ]; then
  echo "  [FAIL] localhost:3001 still in the build:"
  echo "$LEAKED_LOCAL" | sed 's/^/    /'
  echo "  This means .env wasn't picked up. Check $DASH_ENV and re-run."
  exit 1
fi

echo "  [OK] no localhost references in the built bundle"
if [ -n "$BAKED_URL" ]; then
  echo "  Sample baked URLs:"
  echo "$BAKED_URL" | sed 's/^/    /'
fi

# ---------------------------------------------------------------------
# 5. Restart PM2
# ---------------------------------------------------------------------
echo ""
echo "--- 5. Restart PM2 ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-dashboard
  sleep 5
  pm2 status spm-dashboard
"

# ---------------------------------------------------------------------
# 6. Health check
# ---------------------------------------------------------------------
echo ""
echo "--- 6. Health check ---"
sleep 2

DASH_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 2>/dev/null || echo "000")
printf "  Dashboard / : %s  (expect 200 or 307)\n" "$DASH_CODE"

# ---------------------------------------------------------------------
# 7. Done
# ---------------------------------------------------------------------
echo ""
echo "================================================================"
echo " Done $(date)"
echo "================================================================"
echo ""
echo "IMPORTANT: hard-refresh the browser (Ctrl+Shift+R) to bypass"
echo "the old cached JS bundle. Otherwise the browser keeps hitting"
echo "the old localhost URL until the cached chunks expire."
echo ""
echo "Log saved to: $LOG"
