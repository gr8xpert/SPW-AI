#!/bin/bash
# Fix CORS + test API from browser perspective
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/fix-cors-and-test.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
API_ENV="$PROJECT/apps/api/.env"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/fix-cors-output.txt"

exec > "$OUT" 2>&1

echo "=== Fix CORS $(date) ==="

echo ""
echo "--- 1. Check current DASHBOARD_URL ---"
grep "DASHBOARD_URL" "$API_ENV" 2>/dev/null || echo "[MISSING] DASHBOARD_URL not in .env"

echo ""
echo "--- 2. Add DASHBOARD_URL if missing ---"
if grep -q "^DASHBOARD_URL=" "$API_ENV" 2>/dev/null; then
  echo "Already set:"
  grep "^DASHBOARD_URL=" "$API_ENV"
  echo "Updating to correct value..."
  sed -i 's|^DASHBOARD_URL=.*|DASHBOARD_URL=https://dashboard.spw-ai.com|' "$API_ENV"
else
  echo "" >> "$API_ENV"
  echo "# Dashboard URL for CORS" >> "$API_ENV"
  echo "DASHBOARD_URL=https://dashboard.spw-ai.com" >> "$API_ENV"
  echo "[OK] Added DASHBOARD_URL=https://dashboard.spw-ai.com"
fi

echo ""
echo "--- 3. Verify .env has DASHBOARD_URL ---"
grep "DASHBOARD_URL" "$API_ENV"

echo ""
echo "--- 4. Restart PM2 ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pm2 restart all
  sleep 8
  pm2 status
"

echo ""
echo "--- 5. API Health after restart ---"
curl -s http://127.0.0.1:3001/api/health 2>/dev/null || echo "[FAIL] API not responding"
echo ""

echo ""
echo "--- 6. Test CORS headers ---"
echo "Preflight (OPTIONS) from dashboard.spw-ai.com:"
curl -s -I -X OPTIONS http://127.0.0.1:3001/api/super-admin/webmasters \
  -H "Origin: https://dashboard.spw-ai.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" 2>/dev/null | head -15
echo ""

echo "GET with Origin header:"
curl -s -I http://127.0.0.1:3001/api/health \
  -H "Origin: https://dashboard.spw-ai.com" 2>/dev/null | grep -i "access-control"

echo ""
echo "--- 7. Test SSL on api.spw-ai.com ---"
curl -s -o /dev/null -w "HTTPS status: %{http_code}\n" https://api.spw-ai.com/api/health 2>/dev/null || echo "[FAIL] HTTPS not working on api.spw-ai.com"
curl -s -o /dev/null -w "HTTPS status: %{http_code}\n" https://dashboard.spw-ai.com 2>/dev/null || echo "[FAIL] HTTPS not working on dashboard.spw-ai.com"

echo ""
echo "--- 8. Final login + webmaster creation test ---"
LOGIN=$(curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"webmaster@realtysoft.eu","password":"SpwSuperAdmin2026!"}' 2>/dev/null)

TOKEN=$(echo "$LOGIN" | grep -o '"accessToken":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  echo "[OK] Login works"

  # Test webmaster creation
  RESULT=$(curl -s -X POST http://127.0.0.1:3001/api/super-admin/webmasters \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Origin: https://dashboard.spw-ai.com" \
    -d '{"name":"CORS Test","email":"cors-test@test.com","password":"TestPass123!"}' 2>/dev/null)
  echo "Create webmaster result: $RESULT"

  # Check CORS header on the response
  CORS_HEADER=$(curl -s -D - -o /dev/null -X POST http://127.0.0.1:3001/api/super-admin/webmasters \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Origin: https://dashboard.spw-ai.com" \
    -d '{"name":"CORS Test2","email":"cors-test2@test.com","password":"TestPass123!"}' 2>/dev/null | grep -i "access-control")
  echo "CORS headers on POST: $CORS_HEADER"

  # Cleanup
  mysql -u spw_2020admin -p'7SVqhGsun8@~4mfz' spw_prod -e "DELETE FROM users WHERE email LIKE 'cors-test%';" 2>/dev/null
  echo "[cleanup] Deleted test users"
else
  echo "[FAIL] Login failed after restart!"
  echo "$LOGIN"
fi

echo ""
echo "=== Done ==="

chmod 644 "$OUT"
