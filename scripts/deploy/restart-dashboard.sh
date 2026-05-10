#!/bin/bash
# Restart the dashboard PM2 process. Use after uploading new
# apps/dashboard/.next + src files via File Manager.
#
# bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/restart-dashboard.sh

su - spw-ai.com_owyn3ig1vb -s /bin/bash -c '
  export NVM_DIR=/var/www/vhosts/spw-ai.com/.nvm
  . $NVM_DIR/nvm.sh
  pm2 restart spm-dashboard
  sleep 3
  pm2 status spm-dashboard
'

echo ""
echo "Dashboard restarted. Hard-refresh the browser (Ctrl+Shift+R) to bypass cache."
