#!/bin/bash
# Add super admin credentials to .env and re-run seed
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/seed-super-admin.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
API_ENV="$PROJECT/apps/api/.env"
HOME_DIR="/var/www/vhosts/spw-ai.com"

export NVM_DIR="$HOME_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "=== Seed Super Admin ==="

# Add seed vars if not already present
if grep -q "SEED_SUPER_ADMIN_EMAIL" "$API_ENV"; then
    echo "SEED vars already in .env — skipping"
else
    echo "" >> "$API_ENV"
    echo "# Super Admin Seed" >> "$API_ENV"
    echo "SEED_SUPER_ADMIN_EMAIL=webmaster@realtysoft.eu" >> "$API_ENV"
    echo "SEED_SUPER_ADMIN_PASSWORD=SpwAdmin2026!@#" >> "$API_ENV"
    echo "[OK] Added seed vars to .env"
fi

echo ""
echo "--- Running seed ---"
cd "$PROJECT"
pnpm --filter api seed
echo ""
echo "=== Done ==="
echo "Login: https://dashboard.spw-ai.com"
echo "Email: webmaster@realtysoft.eu"
echo "Password: SpwAdmin2026!@#"
echo ""
echo "IMPORTANT: Change this password after first login!"
