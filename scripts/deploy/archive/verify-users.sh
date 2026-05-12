#!/bin/bash
# Verify users exist in database and re-run seed if needed
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/verify-users.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"

export NVM_DIR="$HOME_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "=== Verify Users ==="

# Check if env vars exist
echo "--- Checking .env ---"
grep "SEED_SUPER_ADMIN" "$PROJECT/apps/api/.env" || echo "SEED vars NOT found in .env!"

echo ""
echo "--- Checking database for users ---"
mysql -u spw_2020admin -p'7SVqhGsun8@~4mfz' spw_prod -e "SELECT id, email, role, isActive, emailVerifiedAt FROM users;" 2>/dev/null

echo ""
echo "--- Re-running seed ---"
cd "$PROJECT"
pnpm db:seed 2>&1

echo ""
echo "--- Users after seed ---"
mysql -u spw_2020admin -p'7SVqhGsun8@~4mfz' spw_prod -e "SELECT id, email, role, isActive, emailVerifiedAt FROM users;" 2>/dev/null

echo ""
echo "=== Done ==="
