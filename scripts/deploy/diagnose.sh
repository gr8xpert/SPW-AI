#!/bin/bash
# Diagnose SPW issues — saves output to a downloadable HTML file
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/diagnose.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
DB_USER="spw_2020admin"
DB_PASS='7SVqhGsun8@~4mfz'
DB_NAME="spw_prod"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/diagnose-output.txt"

exec > "$OUT" 2>&1

echo "=== SPW Diagnostics $(date) ==="

echo ""
echo "--- 1. PM2 Status ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 status
"

echo ""
echo "--- 2. API Health Check ---"
curl -s http://127.0.0.1:3001/api/health 2>/dev/null || echo "[FAIL] API not responding on port 3001"
echo ""

echo ""
echo "--- 3. Database: Plans ---"
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT id, name, slug, maxUsers FROM plans;" 2>/dev/null

echo ""
echo "--- 4. Database: Tenants ---"
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT id, name, slug, planId, isInternal, isActive FROM tenants;" 2>/dev/null

echo ""
echo "--- 5. Database: Users ---"
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT id, tenantId, email, name, role, isActive, emailVerifiedAt IS NOT NULL as verified, lastLoginAt FROM users;" 2>/dev/null

echo ""
echo "--- 6. Dashboard .env ---"
cat "$PROJECT/apps/dashboard/.env" 2>/dev/null || echo "[MISSING] No .env file found"

echo ""
echo "--- 7. API .env (relevant vars only) ---"
grep -E "^(SEED_|JWT_|DATABASE_|DB_|CORS|PORT)" "$PROJECT/apps/api/.env" 2>/dev/null || echo "[MISSING]"

echo ""
echo "--- 8. API Error Logs (last 30 lines) ---"
tail -30 "$PROJECT/logs/api-error.log" 2>/dev/null || echo "[EMPTY or MISSING]"

echo ""
echo "--- 9. API Out Logs (last 30 lines) ---"
tail -30 "$PROJECT/logs/api-out.log" 2>/dev/null || echo "[EMPTY or MISSING]"

echo ""
echo "--- 10. Test: Login as super admin (new pass) ---"
LOGIN_RESULT=$(curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"webmaster@realtysoft.eu","password":"SpwSuperAdmin2026!"}' 2>/dev/null)
echo "$LOGIN_RESULT" | head -5

echo ""
echo "--- 11. Test: Login with old password ---"
LOGIN_RESULT2=$(curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"webmaster@realtysoft.eu","password":"SpwAdmin2026!@"}' 2>/dev/null)
echo "$LOGIN_RESULT2" | head -5

echo ""
echo "--- 12. Test: Create webmaster (using token from login) ---"
TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"accessToken":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  TOKEN=$(echo "$LOGIN_RESULT2" | grep -o '"accessToken":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$TOKEN" ]; then
    echo "Using old password token"
  fi
fi

if [ -n "$TOKEN" ]; then
  echo "Got token, testing webmaster creation..."
  CREATE_RESULT=$(curl -s -X POST http://127.0.0.1:3001/api/super-admin/webmasters \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Test WM","email":"test-wm@test.com","password":"TestPass123!"}' 2>/dev/null)
  echo "$CREATE_RESULT"

  TEST_USER_ID=$(echo "$CREATE_RESULT" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
  if [ -n "$TEST_USER_ID" ]; then
    echo "[cleanup] Deleting test user $TEST_USER_ID"
    mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "DELETE FROM users WHERE id = $TEST_USER_ID;" 2>/dev/null
  fi
else
  echo "[SKIP] No token — both logins failed"
fi

echo ""
echo "--- 13. Dashboard Logs (last 20 lines) ---"
tail -20 "$PROJECT/apps/dashboard/logs/dashboard-error.log" 2>/dev/null || echo "[EMPTY or MISSING]"

echo ""
echo "--- 14. Nginx test ---"
nginx -t 2>&1

echo ""
echo "=== Diagnostics Done ==="

# Make it downloadable
chmod 644 "$OUT"
echo ""
echo "Output saved to: $OUT"
echo "Download from: https://spw-ai.com/diagnose-output.txt"
