#!/bin/bash
# Restart the API PM2 process and force-reload the .env file. Use after
# editing apps/api/.env (e.g. adding OPENROUTER_API_KEY) when you don't
# need to recompile — just want PM2 to re-read environment variables.
#
# bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/restart-api.sh

su - spw-ai.com_owyn3ig1vb -s /bin/bash -c '
  export NVM_DIR=/var/www/vhosts/spw-ai.com/.nvm
  . $NVM_DIR/nvm.sh
  pm2 restart spm-api --update-env
  sleep 3
  pm2 status spm-api
  echo ""
  echo "--- Verify OPENROUTER_API_KEY is loaded ---"
  pm2 env 0 2>/dev/null | grep -i openrouter || echo "  (env command not supported on this PM2 version — that is OK if status shows online)"
'

echo ""
echo "API restarted. AI enrichment will use OPENROUTER_API_KEY from .env on the next feed import."
