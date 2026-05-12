#!/bin/bash
# Rebuild dashboard with correct API URL + fix API CORS
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/rebuild-and-fix.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
API_ENV="$PROJECT/apps/api/.env"
DASH_ENV="$PROJECT/apps/dashboard/.env"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/rebuild-output.txt"

exec > "$OUT" 2>&1

echo "=== Rebuild & Fix $(date) ==="

# --- Fix 1: Add DASHBOARD_URL to API .env for CORS ---
echo ""
echo "--- Fix 1: API CORS (DASHBOARD_URL) ---"
if grep -q "^DASHBOARD_URL=" "$API_ENV" 2>/dev/null; then
  sed -i 's|^DASHBOARD_URL=.*|DASHBOARD_URL=https://dashboard.spw-ai.com|' "$API_ENV"
  echo "[OK] Updated DASHBOARD_URL"
else
  echo "" >> "$API_ENV"
  echo "DASHBOARD_URL=https://dashboard.spw-ai.com" >> "$API_ENV"
  echo "[OK] Added DASHBOARD_URL=https://dashboard.spw-ai.com"
fi

# --- Fix 2: Ensure dashboard .env is correct ---
echo ""
echo "--- Fix 2: Dashboard .env ---"
echo "Current NEXT_PUBLIC_API_URL:"
grep "NEXT_PUBLIC_API_URL" "$DASH_ENV" 2>/dev/null || echo "[MISSING]"
echo ""
echo "Current API_URL:"
grep "^API_URL=" "$DASH_ENV" 2>/dev/null || echo "[MISSING]"

# --- Fix 3: Rebuild dashboard (bakes NEXT_PUBLIC_* into JS) ---
echo ""
echo "--- Fix 3: Rebuild Dashboard ---"
echo "This will take a few minutes..."

su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT

  echo 'Node: '$(node -v)' | pnpm: '$(pnpm -v)

  echo ''
  echo '--- Building dashboard ---'
  pnpm --filter dashboard build 2>&1

  echo ''
  echo '--- Restarting PM2 ---'
  pm2 restart all
  sleep 10
  pm2 status
"

echo ""
echo "--- Verify: API Health ---"
curl -s http://127.0.0.1:3001/api/health 2>/dev/null || echo "[FAIL]"
echo ""

echo ""
echo "--- Verify: CORS headers ---"
curl -s -I -X OPTIONS http://127.0.0.1:3001/api/health \
  -H "Origin: https://dashboard.spw-ai.com" \
  -H "Access-Control-Request-Method: GET" 2>/dev/null | grep -i "access-control"

echo ""
echo "--- Verify: Dashboard responding ---"
curl -s -o /dev/null -w "Dashboard HTTP status: %{http_code}\n" http://127.0.0.1:3000 2>/dev/null

echo ""
echo "=== Done ==="
echo "Clear browser cache (Ctrl+Shift+Delete) and try again."
echo "URL: https://dashboard.spw-ai.com"

chmod 644 "$OUT"
