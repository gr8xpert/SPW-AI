#!/usr/bin/env bash
# Reports what's currently deployed on prod. Run as root (so it can su to the
# site user for PM2 commands and read the .env for DB creds).
#
# Usage:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/check-prod-state.sh
#
# Output is mirrored to OUT_FILE (default /var/www/vhosts/spw-ai.com/httpdocs/prod-state-output.txt)
# — grab it via SFTP and paste back here so we can plan the deploy.

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR_PATH="$HOME_DIR/.nvm"
PM2_NAME="spm-api"
ENV_FILE="$PROJECT/apps/api/.env"
OUT_FILE="${OUT_FILE:-/var/www/vhosts/spw-ai.com/httpdocs/prod-state-output.txt}"

mkdir -p "$(dirname "$OUT_FILE")" 2>/dev/null || true
exec > >(tee "$OUT_FILE") 2>&1

echo "=== check-prod-state.sh @ $(date) ==="
echo "  PROJECT=$PROJECT"
echo "  OUT_FILE=$OUT_FILE"
echo

# ------------------------------------------------------------------
echo "=== 1. Build artifact timestamps (when each piece was last uploaded) ==="
for f in \
  "$PROJECT/apps/api/dist/main.js" \
  "$PROJECT/apps/api/dist/database/seed.js" \
  "$PROJECT/apps/dashboard/.next/BUILD_ID" \
  "$PROJECT/apps/widget/dist/index.html" \
  "$PROJECT/packages/shared/dist/index.js" \
; do
  if [ -e "$f" ]; then
    printf '  %s\n      %s\n' "$f" "$(stat -c '%y  size=%s' "$f")"
  else
    printf '  %s\n      MISSING\n' "$f"
  fi
done

# ------------------------------------------------------------------
echo
echo "=== 2. Dashboard BUILD_ID (Next.js fingerprint) ==="
if [ -r "$PROJECT/apps/dashboard/.next/BUILD_ID" ]; then
  echo "  BUILD_ID = $(cat "$PROJECT/apps/dashboard/.next/BUILD_ID")"
else
  echo "  (no BUILD_ID file)"
fi

# ------------------------------------------------------------------
echo
echo "=== 3. Previous deploy marker (if any) ==="
if [ -r "$PROJECT/DEPLOYED.txt" ]; then
  cat "$PROJECT/DEPLOYED.txt"
else
  echo "  (no DEPLOYED.txt — first time tracking)"
fi

# ------------------------------------------------------------------
echo
echo "=== 4. PM2 process state ==="
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$NVM_DIR_PATH\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 list
  echo
  echo '--- pm2 describe $PM2_NAME (uptime + restart count) ---'
  pm2 describe $PM2_NAME | grep -E 'uptime|restart|status|exec mode|created|node version' || true
" 2>&1 || echo "  (failed to read PM2 — process may not exist under this user)"

# ------------------------------------------------------------------
echo
echo "=== 5. Last DB migrations applied ==="
if [ -r "$ENV_FILE" ]; then
  # Safely extract DB vars without sourcing (passwords may contain shell chars)
  get_env() {
    grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/'
  }
  DB_HOST="$(get_env DATABASE_HOST)"
  DB_PORT="$(get_env DATABASE_PORT)"
  DB_USER="$(get_env DATABASE_USER)"
  DB_PASS="$(get_env DATABASE_PASSWORD)"
  DB_NAME="$(get_env DATABASE_NAME)"
  : "${DB_HOST:=localhost}"
  : "${DB_PORT:=3306}"
  if [ -n "$DB_USER" ] && [ -n "$DB_NAME" ]; then
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
      -e "SELECT id, name, FROM_UNIXTIME(timestamp/1000) AS ran_at FROM migrations ORDER BY timestamp DESC LIMIT 10;" 2>&1 \
      | sed 's/^/  /'
  else
    echo "  (DATABASE_USER/NAME empty in .env — skipped)"
  fi
else
  echo "  (.env not readable: $ENV_FILE)"
fi

# ------------------------------------------------------------------
echo
echo "=== 6. API health probe (proves what code is actually serving) ==="
for ep in /api/v1/labels; do
  code=$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' "https://api.spw-ai.com$ep" || echo 000)
  printf '  %-30s %s\n' "GET $ep" "$code"
done

# ------------------------------------------------------------------
echo
echo "=== 7. nginx access log — last 5 hits on the API (proves prod is live) ==="
NGINX_LOG="/var/www/vhosts/system/api.spw-ai.com/logs/access_ssl_log"
if [ -r "$NGINX_LOG" ]; then
  tail -5 "$NGINX_LOG" | sed 's/^/  /'
else
  # Fall back to anything matching
  for log in /var/www/vhosts/system/api.spw-ai.com/logs/*access*; do
    [ -r "$log" ] && { echo "  ($log):"; tail -5 "$log" | sed 's/^/    /'; break; }
  done
fi

echo
echo "=== Done ==="
echo "Output saved to: $OUT_FILE"
echo "Grab it via SFTP and paste back into the chat."
