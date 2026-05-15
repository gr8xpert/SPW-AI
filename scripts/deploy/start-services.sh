#!/bin/bash
# Bring API up under the right Plesk user. Run as root.
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/deploy/start-services.sh

SPW_USER="spw-ai.com_owyn3ig1vb"
SPW_HOME="/var/www/vhosts/spw-ai.com"
PROJECT_DIR="$SPW_HOME/httpdocs/spw"
NODE_BIN="$SPW_HOME/.nvm/versions/node/v20.20.2/bin"
OUT="$SPW_HOME/httpdocs/start-services-output.txt"

# Run a command as the spw user with node/pm2 on PATH
asuser() {
  sudo -u "$SPW_USER" -H bash -lc "export PATH=$NODE_BIN:\$PATH; cd $PROJECT_DIR; $*"
}

{
echo "=== Start Services $(date) ==="
echo ""

echo "--- pm2 status (before) ---"
asuser "pm2 status"
echo ""

echo "--- pm2 resurrect ---"
asuser "pm2 resurrect"
sleep 2
asuser "pm2 status"
echo ""

# If spm-api not online, start it
API_ONLINE=$(asuser "pm2 jlist 2>/dev/null" | grep -c '"name":"spm-api"[^}]*"status":"online"')
echo "spm-api online count: $API_ONLINE"
if [ "$API_ONLINE" -lt 1 ]; then
  echo "--- starting spm-api from ecosystem.config.js ---"
  asuser "pm2 start ecosystem.config.js --only spm-api --env production"
  sleep 5
  asuser "pm2 status"
fi
echo ""

echo "--- pm2 save (persist for reboot) ---"
asuser "pm2 save"
echo ""

echo "--- Ports listening ---"
ss -tlnp 2>&1 | grep -E ":(3000|3001)\b" || echo "WARNING: 3000/3001 not listening"
echo ""

echo "--- API health ---"
curl -sS -i --max-time 8 http://localhost:3001/api/health 2>&1 | head -12
echo ""

echo "--- spm-api recent log (last 50) ---"
asuser "pm2 logs spm-api --lines 50 --nostream" 2>&1 | tail -60
echo ""

echo "=== DONE $(date) ==="
} > "$OUT" 2>&1

echo "Output: $OUT"
tail -60 "$OUT"
