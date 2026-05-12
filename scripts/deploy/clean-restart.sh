#!/bin/bash
# Kill ALL PM2 instances and node processes, then restart cleanly as site user
# Run as ROOT from SSH: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/clean-restart.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
SITE_USER="spw-ai.com_owyn3ig1vb"
HOME_DIR="/var/www/vhosts/spw-ai.com"

echo "=== Clean Restart ==="

echo "--- Killing root PM2 ---"
pm2 kill 2>/dev/null || true

echo "--- Killing site-user PM2 ---"
su - "$SITE_USER" -s /bin/bash -c "export NVM_DIR=\"$HOME_DIR/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && pm2 kill" 2>/dev/null || true

echo "--- Killing any remaining node on port 3001/3000 ---"
fuser -k 3001/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 2

echo "--- Fixing log ownership ---"
rm -rf "$PROJECT/logs"
mkdir -p "$PROJECT/logs"
chown "$SITE_USER:psacln" "$PROJECT/logs"
rm -rf "$PROJECT/apps/dashboard/logs"
mkdir -p "$PROJECT/apps/dashboard/logs"
chown "$SITE_USER:psacln" "$PROJECT/apps/dashboard/logs"

echo "--- Starting PM2 as site user ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pm2 start ecosystem.config.js --env production
  pm2 save
  sleep 10
  pm2 status
"

echo ""
echo "--- Health Check ---"
curl -s http://127.0.0.1:3001/api/health || echo "API not responding"
echo ""
curl -sI http://127.0.0.1:3000 | head -1 || echo "Dashboard not responding"

echo ""
echo "=== Done ==="
