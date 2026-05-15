#!/bin/bash
# Diagnose dashboard login "Invalid email or password" failure.
# Usage:
#   1. FTP this file to:   /var/www/vhosts/spw-ai.com/httpdocs/deploy/diagnose-login.sh
#   2. SSH and run:        bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/diagnose-login.sh
#   3. Output saved to:    /var/www/vhosts/spw-ai.com/httpdocs/diagnose-login-output.txt
#
# Before running: edit TEST_EMAIL + TEST_PASS below to a real account (super admin or client).

TEST_EMAIL="REPLACE_WITH_REAL_EMAIL"
TEST_PASS="REPLACE_WITH_REAL_PASSWORD"

OUT="/var/www/vhosts/spw-ai.com/httpdocs/diagnose-login-output.txt"
API_LOCAL="http://localhost:3001"

{
echo "============================================================"
echo " SPW Dashboard Login Diagnostic"
echo " $(date)"
echo "============================================================"
echo ""

# ─── 1. PM2 process state ────────────────────────────────────────
echo "--- 1. PM2 STATUS ---"
pm2 status 2>&1 || echo "ERROR: pm2 not found in PATH"
echo ""

# ─── 2. API health endpoint ──────────────────────────────────────
echo "--- 2. API HEALTH (localhost:3001) ---"
curl -sS -i --max-time 8 "$API_LOCAL/api/health" 2>&1 | head -20
echo ""
echo "--- 2b. API HEALTH via public URL (whatever NEXT_PUBLIC_API_URL is) ---"
PUBLIC_API=$(pm2 env spw-dashboard 2>/dev/null | grep -E "^NEXT_PUBLIC_API_URL=" | head -1 | cut -d= -f2-)
if [ -z "$PUBLIC_API" ]; then
  PUBLIC_API=$(pm2 env 1 2>/dev/null | grep -E "^NEXT_PUBLIC_API_URL=" | head -1 | cut -d= -f2-)
fi
echo "PUBLIC_API resolved to: '$PUBLIC_API'"
if [ -n "$PUBLIC_API" ]; then
  curl -sS -i --max-time 8 "$PUBLIC_API/api/health" 2>&1 | head -20
fi
echo ""

# ─── 3. Actual login POST — this exposes the real error ─────────
echo "--- 3. LOGIN POST (the real error message lives here) ---"
echo "POSTing to: $API_LOCAL/api/auth/login"
echo "Email: $TEST_EMAIL"
echo ""
LOGIN_RESP=$(curl -sS -i --max-time 10 -X POST "$API_LOCAL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}" 2>&1)
echo "$LOGIN_RESP"
echo ""

# ─── 4. Dashboard env vars (the auth provider reads these) ──────
echo "--- 4. DASHBOARD ENV VARS ---"
DASH_NAMES=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys; arr=json.load(sys.stdin); [print(p['name']) for p in arr if 'dashboard' in p['name'].lower() or 'web' in p['name'].lower()]" 2>/dev/null)
echo "Dashboard PM2 names: $DASH_NAMES"
for name in $DASH_NAMES; do
  echo ""
  echo "  -- env of $name --"
  pm2 env "$name" 2>&1 | grep -E "^(API_URL|NEXT_PUBLIC_API_URL|NEXTAUTH_URL|NEXTAUTH_SECRET|NODE_ENV)=" \
    | sed -E 's/(NEXTAUTH_SECRET=).+/\1[REDACTED LEN=]/'
done
echo ""

# ─── 5. API env vars (jwt secret, db) ───────────────────────────
echo "--- 5. API ENV VARS (secrets redacted) ---"
API_NAMES=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys; arr=json.load(sys.stdin); [print(p['name']) for p in arr if 'api' in p['name'].lower()]" 2>/dev/null)
echo "API PM2 names: $API_NAMES"
for name in $API_NAMES; do
  echo ""
  echo "  -- env of $name --"
  pm2 env "$name" 2>&1 | grep -E "^(NODE_ENV|PORT|DATABASE_|DB_|JWT_|REFRESH_|MYSQL_)" \
    | sed -E 's/(SECRET=|PASSWORD=).+/\1[REDACTED]/'
done
echo ""

# ─── 6. Recent API errors ───────────────────────────────────────
echo "--- 6. API LOGS (last 80 lines, errors only) ---"
for name in $API_NAMES; do
  echo "  -- logs of $name --"
  pm2 logs "$name" --lines 80 --nostream 2>&1 | tail -100
done
echo ""

# ─── 7. Check user in DB ────────────────────────────────────────
echo "--- 7. DATABASE: user record for $TEST_EMAIL ---"
DB_HOST=$(pm2 env $(echo $API_NAMES | awk '{print $1}') 2>/dev/null | grep -E "^DB_HOST=|^DATABASE_HOST=" | head -1 | cut -d= -f2-)
DB_USER=$(pm2 env $(echo $API_NAMES | awk '{print $1}') 2>/dev/null | grep -E "^DB_USERNAME=|^DATABASE_USERNAME=|^DB_USER=" | head -1 | cut -d= -f2-)
DB_PASS=$(pm2 env $(echo $API_NAMES | awk '{print $1}') 2>/dev/null | grep -E "^DB_PASSWORD=|^DATABASE_PASSWORD=" | head -1 | cut -d= -f2-)
DB_NAME=$(pm2 env $(echo $API_NAMES | awk '{print $1}') 2>/dev/null | grep -E "^DB_DATABASE=|^DATABASE_NAME=|^DB_NAME=" | head -1 | cut -d= -f2-)
echo "DB: host=$DB_HOST user=$DB_USER db=$DB_NAME"
if command -v mysql >/dev/null 2>&1 && [ -n "$DB_HOST" ] && [ -n "$DB_USER" ]; then
  mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e \
    "SELECT id, email, role, isActive, emailVerifiedAt, tenantId, LEFT(passwordHash,10) AS hashPrefix FROM users WHERE email='$TEST_EMAIL'\\G" 2>&1
  echo ""
  echo "--- 7b. Tenant status for this user ---"
  mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e \
    "SELECT t.id, t.name, t.slug, t.isActive FROM tenants t JOIN users u ON u.tenantId=t.id WHERE u.email='$TEST_EMAIL'\\G" 2>&1
  echo ""
  echo "--- 7c. All super_admin users ---"
  mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e \
    "SELECT id, email, role, isActive, emailVerifiedAt FROM users WHERE role='super_admin'\\G" 2>&1
else
  echo "(mysql client unavailable or DB env not detected — skipping)"
fi
echo ""

echo "============================================================"
echo " END"
echo "============================================================"
} > "$OUT" 2>&1

echo "Diagnostic written to: $OUT"
echo "View with: cat $OUT"
