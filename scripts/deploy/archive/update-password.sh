#!/bin/bash
# Update super admin password
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/update-password.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"

export NVM_DIR="$HOME_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

NEW_PASSWORD="SpwSuperAdmin2026!"

echo "=== Update Super Admin Password ==="

# Use a temp node script to hash — avoids path/escaping issues
cat > /tmp/hash-pw.js << 'SCRIPT'
const bcrypt = require('bcrypt');
bcrypt.hash(process.argv[1], 12).then(h => {
  console.log(h);
});
SCRIPT

cd "$PROJECT/apps/api"
HASH=$(node -e "require('bcrypt').hash('$NEW_PASSWORD', 12).then(h => console.log(h))")

if [ -z "$HASH" ]; then
  echo "[FAILED] Could not generate hash with bcrypt module"
  echo "Trying with project node_modules..."
  cd "$PROJECT"
  HASH=$(node -e "
    const path = require('path');
    const bcrypt = require(require.resolve('bcrypt', {paths:['$PROJECT/apps/api/node_modules','$PROJECT/node_modules']}));
    bcrypt.hash('$NEW_PASSWORD', 12).then(h => console.log(h));
  ")
fi

if [ -z "$HASH" ]; then
  echo "[FAILED] Still could not hash. Generating via htpasswd fallback..."
  exit 1
fi

echo "Hash: $HASH"

mysql -u spw_2020admin -p'7SVqhGsun8@~4mfz' spw_prod -e "
UPDATE users SET passwordHash = '$HASH' WHERE email = 'webmaster@realtysoft.eu';
"
echo ""
echo "[OK] Password updated"
echo "Email: webmaster@realtysoft.eu"
echo "Password: $NEW_PASSWORD"
