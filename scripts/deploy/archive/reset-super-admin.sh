#!/bin/bash
# Delete and re-create super admin with correct password
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/reset-super-admin.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
API_ENV="$PROJECT/apps/api/.env"

export NVM_DIR="$HOME_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "=== Reset Super Admin ==="

# Fix password in .env (quote it to prevent # issues)
sed -i '/SEED_SUPER_ADMIN/d' "$API_ENV"
echo '' >> "$API_ENV"
echo 'SEED_SUPER_ADMIN_EMAIL=webmaster@realtysoft.eu' >> "$API_ENV"
echo 'SEED_SUPER_ADMIN_PASSWORD="SpwSuperAdmin2026!"' >> "$API_ENV"
echo "[OK] Updated .env"

# Delete existing user
mysql -u spw_2020admin -p'7SVqhGsun8@~4mfz' spw_prod -e "
DELETE FROM users WHERE email = 'webmaster@realtysoft.eu';
"
echo "[OK] Deleted old user"

# Re-run seed
cd "$PROJECT"
pnpm db:seed 2>&1

echo ""
echo "--- Verify ---"
mysql -u spw_2020admin -p'7SVqhGsun8@~4mfz' spw_prod -e "SELECT id, email, role FROM users;"

echo ""
echo "=== Done ==="
echo "Email: webmaster@realtysoft.eu"
echo "Password: SpwSuperAdmin2026!"
