#!/bin/bash
# Fix logs directory permissions and restart PM2
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/fix-logs-permissions.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"

export NVM_DIR="$HOME_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "=== Fix logs permissions ==="

rm -rf "$PROJECT/logs"
mkdir -p "$PROJECT/logs"
touch "$PROJECT/logs/api-combined.log" \
      "$PROJECT/logs/api-error.log" \
      "$PROJECT/logs/api-out.log" \
      "$PROJECT/logs/dashboard-combined.log" \
      "$PROJECT/logs/dashboard-error.log" \
      "$PROJECT/logs/dashboard-out.log"
chmod 755 "$PROJECT/logs"
chmod 644 "$PROJECT/logs"/*.log

echo "[OK] Logs directory recreated"
ls -la "$PROJECT/logs/"

echo ""
echo "=== Restarting PM2 ==="
cd "$PROJECT"
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js --env production
sleep 10
pm2 status

echo ""
echo "=== Health Check ==="
curl -s http://127.0.0.1:3001/api/health || echo "API not responding yet"
echo ""
curl -sI http://127.0.0.1:3000 | head -1 || echo "Dashboard not responding yet"

echo ""
echo "=== Done ==="
