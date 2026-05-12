#!/bin/bash
# Fix .env.local override, rebuild dashboard
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/rebuild-dashboard-v3.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
DASH="$PROJECT/apps/dashboard"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/rebuild-v3-output.txt"

exec > "$OUT" 2>&1

echo "=== Rebuild Dashboard v3 $(date) ==="

# Step 1: Show what .env files exist
echo "--- 1. Dashboard env files ---"
ls -la "$DASH"/.env* 2>/dev/null
echo ""
echo ".env.local contents:"
cat "$DASH/.env.local" 2>/dev/null || echo "[not found]"
echo ""
echo ".env contents:"
cat "$DASH/.env" 2>/dev/null || echo "[not found]"

# Step 2: Remove .env.local (it overrides .env in Next.js)
echo ""
echo "--- 2. Remove .env.local ---"
rm -f "$DASH/.env.local"
echo "[OK] Removed .env.local"

# Step 3: Verify .env has correct values
echo ""
echo "--- 3. Verify .env ---"
grep "NEXT_PUBLIC_API_URL" "$DASH/.env"
grep "API_URL" "$DASH/.env"

# Step 4: Stop dashboard, clean .next, fix perms
echo ""
echo "--- 4. Stop + clean ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 stop spm-dashboard 2>/dev/null
"
rm -rf "$DASH/.next"
chown -R "$SITE_USER:psacln" "$DASH"
echo "[OK] Stopped, cleaned, ownership fixed"

# Step 5: Rebuild
echo ""
echo "--- 5. Rebuild dashboard ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm --filter dashboard build 2>&1
"
echo "Build exit: $?"

# Step 6: Verify env was baked correctly
echo ""
echo "--- 6. Verify baked API URL ---"
grep -r "localhost:3001" "$DASH/.next/server/" 2>/dev/null | head -5 || echo "[OK] No localhost:3001 in server build"
grep -r "api.spw-ai.com" "$DASH/.next/server/" 2>/dev/null | head -3 && echo "[OK] api.spw-ai.com found in build"

# Step 7: Restart
echo ""
echo "--- 7. Restart PM2 ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-dashboard
  sleep 10
  pm2 status
"

# Step 8: Verify
echo ""
echo "--- 8. Verify ---"
curl -s -o /dev/null -w "Dashboard: %{http_code}\n" http://127.0.0.1:3000 2>/dev/null
curl -s -o /dev/null -w "API: %{http_code}\n" http://127.0.0.1:3001/api/health 2>/dev/null

echo ""
echo "=== Done ==="
echo "IMPORTANT: Hard refresh browser with Ctrl+Shift+R"

chmod 644 "$OUT"
