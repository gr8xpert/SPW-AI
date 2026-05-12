#!/bin/bash
# Run migrations + restart PM2
# Upload to: /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/run-migrations.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"

su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  echo '=== Running Migrations ==='
  npx --yes typeorm migration:run -d apps/api/dist/config/database.config.js
  echo ''
  echo '=== Restarting PM2 ==='
  pm2 restart ecosystem.config.js --env production
  sleep 5
  pm2 status
  echo ''
  echo '=== Done ==='
"
