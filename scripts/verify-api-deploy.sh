#!/usr/bin/env bash
# Post-deploy sanity check for the SPW API.
#
# Usage:
#   ./verify-api-deploy.sh                 # reads ~/.spw-api-key
#   ./verify-api-deploy.sh <api-key>       # pass explicitly
#   API_KEY=spm_xxx ./verify-api-deploy.sh
#
# Output is mirrored to OUT_FILE (default /var/www/vhosts/spw-ai.com/httpdocs/verify-api-output.txt)
# so a co-worker can grab it via SFTP if SSH paste is awkward.
#
# Restarts the API process, waits until it answers HTTP, then probes the four
# widget-public endpoints. A "200" on every line means the deploy is healthy.
# A "404" means dist/ is stale — rebuild and reupload. A "401" means the API
# key is wrong, but the routes are wired correctly.

set -uo pipefail

OUT_FILE="${OUT_FILE:-/var/www/vhosts/spw-ai.com/httpdocs/verify-api-output.txt}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Key resolution order:
#   1. positional arg          ./v.sh spm_xxx
#   2. API_KEY env var         API_KEY=spm_xxx ./v.sh
#   3. apikey.txt next to v.sh (recommended — SFTP-paste-safe, no quoting)
#   4. ~/.spw-api-key          (legacy path)
KEY_FILE="${KEY_FILE:-$SCRIPT_DIR/apikey.txt}"
LEGACY_KEY_FILE="${LEGACY_KEY_FILE:-$HOME/.spw-api-key}"
API_KEY="${1:-${API_KEY:-}}"
if [ -z "$API_KEY" ] && [ -r "$KEY_FILE" ]; then
  API_KEY="$(tr -d '[:space:]' < "$KEY_FILE")"
fi
if [ -z "$API_KEY" ] && [ -r "$LEGACY_KEY_FILE" ]; then
  API_KEY="$(tr -d '[:space:]' < "$LEGACY_KEY_FILE")"
fi
API_BASE="${API_BASE:-https://api.spw-ai.com}"
PM2_NAME="${PM2_NAME:-spm-api}"
PM2_USER="${PM2_USER:-spw-ai.com_owyn3ig1vb}"
NVM_DIR_PATH="${NVM_DIR_PATH:-/var/www/vhosts/spw-ai.com/.nvm}"

# Mirror everything below this point to OUT_FILE (and to the terminal).
mkdir -p "$(dirname "$OUT_FILE")" 2>/dev/null || true
exec > >(tee "$OUT_FILE") 2>&1

echo "=== verify-api-deploy.sh @ $(date) ==="
echo "  API_BASE=$API_BASE"
echo "  PM2_NAME=$PM2_NAME (as $PM2_USER)"
echo "  OUT_FILE=$OUT_FILE"
echo

pm2_run() {
  if [ -n "$PM2_USER" ] && [ "$(id -un)" != "$PM2_USER" ]; then
    su - "$PM2_USER" -s /bin/bash -c "export NVM_DIR=$NVM_DIR_PATH; . \$NVM_DIR/nvm.sh; pm2 $*"
  else
    export NVM_DIR="$NVM_DIR_PATH"
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    pm2 "$@"
  fi
}

if [ -z "$API_KEY" ]; then
  echo "Error: API key not found."
  echo "  Save it once:  echo 'spm_yourkey...' > $KEY_FILE && chmod 600 $KEY_FILE"
  echo "  Or pass it:    ./verify-api-deploy.sh <api-key>"
  exit 1
fi

echo "=== 1/3 Restarting PM2 process: $PM2_NAME ==="
if ! pm2_run describe "$PM2_NAME" >/dev/null 2>&1; then
  echo "PM2 process '$PM2_NAME' not found. Available processes:"
  pm2_run list
  echo
  echo "Re-run with PM2_NAME=<name> ./verify-api-deploy.sh <key>"
  exit 1
fi
pm2_run restart "$PM2_NAME" --update-env

echo
echo "=== 2/3 Waiting for API to answer ==="
# Use /api/v1/labels (we know it's exposed). Anything but 000/502/503/504 means
# the process is back up and nginx is forwarding — auth result doesn't matter.
ready=0
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' "$API_BASE/api/v1/labels" || echo 000)
  case "$code" in
    000|502|503|504)
      sleep 1
      ;;
    *)
      echo "API answered ${code} on /api/v1/labels after ${i}s."
      ready=1
      break
      ;;
  esac
done

if [ "$ready" != "1" ]; then
  echo "API still 5xx/unreachable after 30s."
  echo
  echo "--- pm2 describe (look at 'restarts' — high number means crash loop) ---"
  pm2_run describe "$PM2_NAME"
  echo
  echo "--- last 200 lines from api-combined.log ---"
  COMBINED="/var/www/vhosts/spw-ai.com/httpdocs/spw/logs/api-combined.log"
  if [ -r "$COMBINED" ]; then
    tail -200 "$COMBINED"
  else
    echo "(combined log not readable: $COMBINED)"
  fi
  echo
  echo "--- direct boot test (5s, surfaces crash error PM2 hides) ---"
  APP_DIR="/var/www/vhosts/spw-ai.com/httpdocs/spw"
  su - "$PM2_USER" -s /bin/bash -c "
    export NVM_DIR=$NVM_DIR_PATH
    . \$NVM_DIR/nvm.sh
    cd $APP_DIR/apps/api
    timeout 5 node dist/main.js 2>&1 | tail -80
    echo '(exit: '\$?')'
  "
  exit 1
fi

echo
echo "=== 3/3 Probing widget-public endpoints ==="
fail=0
for ep in locations property-types features labels; do
  code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' -H "x-api-key: $API_KEY" "$API_BASE/api/v1/$ep")
  case "$code" in
    200) printf '  %-16s %s OK\n' "$ep" "$code" ;;
    401) printf '  %-16s %s route OK, key rejected\n' "$ep" "$code"; fail=1 ;;
    404) printf '  %-16s %s route MISSING — dist/ is stale\n' "$ep" "$code"; fail=1 ;;
    *)   printf '  %-16s %s unexpected\n' "$ep" "$code"; fail=1 ;;
  esac
done

echo
if [ "$fail" = "0" ]; then
  echo "All 4 endpoints returned 200. Deploy verified."
  echo "Output saved to: $OUT_FILE"
  exit 0
else
  echo "One or more endpoints failed. See above."
  echo "Output saved to: $OUT_FILE"
  exit 1
fi
