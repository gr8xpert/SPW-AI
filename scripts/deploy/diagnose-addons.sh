#!/bin/bash
# Diagnose: dashboard add-on toggle not reflecting on client side.
#
# Usage:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/diagnose-addons.sh
#
# Output saved to: httpdocs/spw/diagnose-addons.txt

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
OUT="$PROJECT/diagnose-addons.txt"
ENV_FILE="$PROJECT/apps/api/.env"

exec > "$OUT" 2>&1

echo "================================================================"
echo " Dashboard add-ons diagnostic — $(date)"
echo "================================================================"

# ---------------------------------------------------------------------
# 1. API dist freshness
# ---------------------------------------------------------------------
echo ""
echo "--- 1. API dist freshness ---"

T_SVC="$PROJECT/apps/api/dist/modules/tenant/tenant.service.js"
SA_SVC="$PROJECT/apps/api/dist/modules/super-admin/super-admin.service.js"

if [ -f "$T_SVC" ]; then
  COUNT_T=$(grep -c "dashboardAddons" "$T_SVC")
  echo "tenant.service.js          dashboardAddons count: $COUNT_T  (expect >= 2)"
else
  echo "tenant.service.js          MISSING at $T_SVC"
fi

if [ -f "$SA_SVC" ]; then
  COUNT_SA=$(grep -c "dashboardAddons" "$SA_SVC")
  echo "super-admin.service.js     dashboardAddons count: $COUNT_SA  (expect >= 4)"
else
  echo "super-admin.service.js     MISSING at $SA_SVC"
fi

echo ""
echo "Tenant entity:"
grep -A2 "dashboardAddons" "$PROJECT/apps/api/dist/database/entities/tenant.entity.js" 2>&1 | head -10

# ---------------------------------------------------------------------
# 2. Dashboard build freshness
# ---------------------------------------------------------------------
echo ""
echo "--- 2. Dashboard build freshness ---"

DASH_NEXT="$PROJECT/apps/dashboard/.next/server/app"
if [ -d "$DASH_NEXT" ]; then
  echo "Search for 'Dashboard Add-ons' in build:"
  grep -rl "Dashboard Add-ons" "$DASH_NEXT" 2>/dev/null | head -5

  echo ""
  echo "Search for 'dashboardAddons' references in build:"
  grep -rl "dashboardAddons" "$DASH_NEXT" 2>/dev/null | head -5
else
  echo ".next/server/app missing"
fi

echo ""
echo "Sidebar bundle has lock icon import?"
grep -rl "useDashboardAddons" "$PROJECT/apps/dashboard/.next/server" 2>/dev/null | head -3

# ---------------------------------------------------------------------
# 3. DB schema + actual data
# ---------------------------------------------------------------------
echo ""
echo "--- 3. DB: tenants.dashboardAddons column ---"

DB_HOST=$(grep -E "^DATABASE_HOST=" "$ENV_FILE" | head -1 | cut -d= -f2-)
DB_PORT=$(grep -E "^DATABASE_PORT=" "$ENV_FILE" | head -1 | cut -d= -f2-)
DB_NAME=$(grep -E "^DATABASE_NAME=" "$ENV_FILE" | head -1 | cut -d= -f2-)
DB_USER=$(grep -E "^DATABASE_USER=" "$ENV_FILE" | head -1 | cut -d= -f2-)
DB_PASS=$(grep -E "^DATABASE_PASSWORD=" "$ENV_FILE" | head -1 | cut -d= -f2-)

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"

echo "Connecting to $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""

run_sql() {
  MYSQL_PWD="$DB_PASS" mysql --protocol=TCP -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" -e "$1" 2>&1
}

echo "Column definition:"
run_sql "SHOW COLUMNS FROM tenants LIKE 'dashboardAddons';"

echo ""
echo "All tenants — id, name, dashboardAddons:"
run_sql "SELECT id, name, dashboardAddons FROM tenants ORDER BY id;"

echo ""
echo "Migrations table — last 5 entries:"
run_sql "SELECT id, name FROM migrations ORDER BY id DESC LIMIT 5;"

# ---------------------------------------------------------------------
# 4. Live API response
# ---------------------------------------------------------------------
echo ""
echo "--- 4. Live API response from /api/dashboard/tenant ---"
echo "(unauthenticated request — expect 401, but if it responds with"
echo " HTML or empty, the API isn't reachable on 127.0.0.1:3001)"
echo ""

curl -s -i http://127.0.0.1:3001/api/dashboard/tenant 2>&1 | head -10

# ---------------------------------------------------------------------
# 5. PM2 status
# ---------------------------------------------------------------------
echo ""
echo "--- 5. PM2 status ---"
su - "spw-ai.com_owyn3ig1vb" -s /bin/bash -c '
  export NVM_DIR=/var/www/vhosts/spw-ai.com/.nvm
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  pm2 list
' 2>&1

echo ""
echo "================================================================"
echo " Done $(date)"
echo "================================================================"
echo ""
echo "Output saved to: $OUT"

# Print to stdout too so the user sees the path
exec 1>&-
exec 2>&-
echo "Output saved to: $OUT" > /dev/tty
