#!/bin/bash
# Rebuild dashboard + restart
# Run as ROOT: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/rebuild-dashboard.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"

su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  echo '=== Building Dashboard ==='
  pnpm --filter dashboard build
  echo ''
  echo '=== Restarting Dashboard ==='
  pm2 restart spm-dashboard
  sleep 5
  pm2 status
  echo ''
  echo '=== Done ==='
"
