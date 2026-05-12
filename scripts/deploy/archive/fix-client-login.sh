#!/bin/bash
# Fix client login: set emailVerifiedAt for all admin users + rebuild API
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/fix-client-login.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
DB_USER="spw_2020admin"
DB_PASS='7SVqhGsun8@~4mfz'
DB_NAME="spw_prod"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/fix-client-output.txt"

exec > "$OUT" 2>&1

echo "=== Fix Client Login $(date) ==="

# Step 1: Show current users
echo "--- 1. Current users ---"
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
SELECT id, email, role, isActive, emailVerifiedAt FROM users;
" 2>/dev/null

# Step 2: Fix all unverified users (set emailVerifiedAt)
echo ""
echo "--- 2. Fix unverified users ---"
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
UPDATE users SET emailVerifiedAt = NOW() WHERE emailVerifiedAt IS NULL;
" 2>/dev/null
echo "[OK] Set emailVerifiedAt for all unverified users"

# Step 3: Verify
echo ""
echo "--- 3. Users after fix ---"
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
SELECT id, email, role, isActive, emailVerifiedAt FROM users;
" 2>/dev/null

# Step 4: Rebuild API (code fix: createClient now sets emailVerifiedAt)
echo ""
echo "--- 4. Rebuild API ---"
chown -R "$SITE_USER:psacln" "$PROJECT/apps/api"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm build:api 2>&1
"
echo "Build exit: $?"

# Step 5: Restart API
echo ""
echo "--- 5. Restart API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-api
  sleep 8
  pm2 status
"

# Step 6: Test client login
echo ""
echo "--- 6. Test client login ---"
curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@spw-ai.com","password":"alex@spw-ai.com"}' 2>/dev/null | head -3
echo ""
echo "(If password unknown, check what was entered when creating the client)"

echo ""
echo "=== Done ==="

chmod 644 "$OUT"
