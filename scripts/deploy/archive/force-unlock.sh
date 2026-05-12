#!/bin/bash
# Force-unlock all 5 dashboard add-ons for tenant id 2 (Alex Loaisa)
# directly in the DB. Use this to test the READ path independently of
# the super-admin save flow.
#
# After running, log in as that client and hard-refresh — if you see
# the unlocked items, the save path is the problem (not the read path).
#
# bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/force-unlock.sh [tenant_id]

P="/var/www/vhosts/spw-ai.com/httpdocs/spw"
ENV="$P/apps/api/.env"
TENANT_ID="${1:-2}"

DH=$(grep -E "^DATABASE_HOST=" "$ENV" | cut -d= -f2-)
DP=$(grep -E "^DATABASE_PORT=" "$ENV" | cut -d= -f2-)
DN=$(grep -E "^DATABASE_NAME=" "$ENV" | cut -d= -f2-)
DU=$(grep -E "^DATABASE_USER=" "$ENV" | cut -d= -f2-)
DPW=$(grep -E "^DATABASE_PASSWORD=" "$ENV" | cut -d= -f2-)

run_sql() {
  MYSQL_PWD="$DPW" mysql --protocol=TCP -h "${DH:-localhost}" -P "${DP:-3306}" -u "$DU" "$DN" -e "$1" 2>&1
}

echo "=== Before ==="
run_sql "SELECT id, name, dashboardAddons FROM tenants WHERE id = $TENANT_ID;"

echo ""
echo "=== Setting all 5 add-ons to true for tenant $TENANT_ID ==="
run_sql "
  UPDATE tenants
  SET dashboardAddons = JSON_OBJECT(
    'addProperty', true,
    'emailCampaign', true,
    'feedExport', true,
    'team', true,
    'aiChat', true
  )
  WHERE id = $TENANT_ID;
"

echo ""
echo "=== After ==="
run_sql "SELECT id, name, dashboardAddons FROM tenants WHERE id = $TENANT_ID;"

echo ""
echo "Now: log in as this client + hard-refresh (Ctrl+Shift+R)."
echo "  - Sidebar locks GONE  → save path is broken (frontend or API DTO)"
echo "  - Sidebar still LOCKED → read path is broken (hook / API toPublic)"
