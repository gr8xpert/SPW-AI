#!/bin/bash
# Quick diagnostic — paste the output back to chat.
# bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/check-addons.sh

P="/var/www/vhosts/spw-ai.com/httpdocs/spw"
ENV="$P/apps/api/.env"

DH=$(grep -E "^DATABASE_HOST=" "$ENV" | cut -d= -f2-)
DP=$(grep -E "^DATABASE_PORT=" "$ENV" | cut -d= -f2-)
DN=$(grep -E "^DATABASE_NAME=" "$ENV" | cut -d= -f2-)
DU=$(grep -E "^DATABASE_USER=" "$ENV" | cut -d= -f2-)
DPW=$(grep -E "^DATABASE_PASSWORD=" "$ENV" | cut -d= -f2-)

echo "=== API DIST ==="
echo "tenant.service.js: $(grep -c dashboardAddons $P/apps/api/dist/modules/tenant/tenant.service.js)"
echo "super-admin.service.js: $(grep -c dashboardAddons $P/apps/api/dist/modules/super-admin/super-admin.service.js)"

echo ""
echo "=== tenant.service.js toPublic returns ==="
grep -A1 dashboardAddons $P/apps/api/dist/modules/tenant/tenant.service.js | head -20

echo ""
echo "=== DASHBOARD BUILD ==="
echo "useDashboardAddons in build:"
grep -rl useDashboardAddons $P/apps/dashboard/.next/server 2>/dev/null | head -5
echo ""
echo "LockedRouteGuard in build:"
grep -rl LockedRouteGuard $P/apps/dashboard/.next/server 2>/dev/null | head -5
echo ""
echo "Sidebar lock icon (looking for sidebar.tsx-derived chunks):"
grep -rl '"Email Campaigns"' $P/apps/dashboard/.next/server 2>/dev/null | head -3

echo ""
echo "=== DB TENANTS ==="
MYSQL_PWD="$DPW" mysql --protocol=TCP -h "${DH:-localhost}" -P "${DP:-3306}" -u "$DU" "$DN" -e "SELECT id, name, dashboardAddons FROM tenants;" 2>&1

echo ""
echo "=== LIVE API ==="
curl -s -o /dev/null -w "GET /api/dashboard/tenant : %{http_code}\n" http://127.0.0.1:3001/api/dashboard/tenant
curl -s -o /dev/null -w "GET /api/health           : %{http_code}\n" http://127.0.0.1:3001/api/health

echo ""
echo "=== PM2 ==="
su - spw-ai.com_owyn3ig1vb -s /bin/bash -c '
  export NVM_DIR=/var/www/vhosts/spw-ai.com/.nvm
  . $NVM_DIR/nvm.sh
  pm2 list 2>/dev/null | grep -E "spm-(api|dashboard)"
'
