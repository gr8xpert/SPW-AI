#!/bin/bash
# Deploy: AI settings tab, migration fixes, super-admin email verify, PM2 config
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/deploy-2026-05-07.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/deploy-2026-05-07-output.txt"

exec > "$OUT" 2>&1

echo "=== Deploy started $(date) ==="

# Step 1: Build API
echo ""
echo "--- 1. Build API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm build:api 2>&1
"
echo "API build exit: $?"

# Step 2: Build Dashboard
echo ""
echo "--- 2. Build Dashboard ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm --filter dashboard build 2>&1
"
echo "Dashboard build exit: $?"

# Step 3: Run Migrations
echo ""
echo "--- 3. Run Migrations ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  npx --yes typeorm migration:run -d apps/api/dist/config/database.config.js 2>&1
"
echo "Migration exit: $?"

# Step 4: Restart PM2
echo ""
echo "--- 4. Restart PM2 ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pm2 restart ecosystem.config.js --env production
  sleep 5
  pm2 status
"

# Step 5: Verify
echo ""
echo "--- 5. Verify ---"
curl -s -o /dev/null -w "Dashboard: %{http_code}\n" http://127.0.0.1:3000 2>/dev/null
curl -s -o /dev/null -w "API: %{http_code}\n" http://127.0.0.1:3001/api/health 2>/dev/null

echo ""
echo "=== Done $(date) ==="
echo "Check: Dashboard Settings -> AI tab should be visible"

chmod 644 "$OUT"
