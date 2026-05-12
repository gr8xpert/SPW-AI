#!/bin/bash
# Fix .next permissions and rebuild dashboard
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/rebuild-dashboard-v2.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/rebuild-v2-output.txt"

exec > "$OUT" 2>&1

echo "=== Rebuild Dashboard v2 $(date) ==="

# Step 1: Stop dashboard
echo "--- 1. Stop dashboard ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 stop spm-dashboard 2>/dev/null
"
echo "[OK] Dashboard stopped"

# Step 2: Remove old .next as root (owned by root, site user can't delete)
echo ""
echo "--- 2. Remove old .next directory (as root) ---"
rm -rf "$PROJECT/apps/dashboard/.next"
echo "[OK] Removed .next"

# Step 3: Fix ownership of entire dashboard dir
echo ""
echo "--- 3. Fix ownership ---"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/dashboard"
echo "[OK] Ownership fixed"

# Step 4: Rebuild as site user
echo ""
echo "--- 4. Rebuild dashboard (this takes a few minutes) ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm --filter dashboard build 2>&1
"
BUILD_EXIT=$?
echo "Build exit code: $BUILD_EXIT"

# Step 5: Restart dashboard
echo ""
echo "--- 5. Restart PM2 ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pm2 restart spm-dashboard
  sleep 10
  pm2 status
"

# Step 6: Verify
echo ""
echo "--- 6. Verify ---"
curl -s -o /dev/null -w "Dashboard: %{http_code}\n" http://127.0.0.1:3000 2>/dev/null
curl -s -o /dev/null -w "API: %{http_code}\n" http://127.0.0.1:3001/api/health 2>/dev/null

echo ""
echo "=== Done ==="
echo "Clear browser cache (Ctrl+Shift+Delete) and reload https://dashboard.spw-ai.com"

chmod 644 "$OUT"
