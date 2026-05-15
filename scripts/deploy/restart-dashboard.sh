#!/usr/bin/env bash
# Restart only spm-dashboard after a .next-only re-upload.
# Use after a dashboard-only fix (no API changes, no migrations).
#
# Run as ROOT:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/restart-dashboard.sh

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR_PATH="$HOME_DIR/.nvm"
OUT_FILE="${OUT_FILE:-/var/www/vhosts/spw-ai.com/httpdocs/restart-dashboard-output.txt}"

mkdir -p "$(dirname "$OUT_FILE")" 2>/dev/null || true
exec > >(tee "$OUT_FILE") 2>&1

echo "=== restart-dashboard.sh @ $(date) ==="

# Sanity check the new .next was uploaded
test -r "$PROJECT/apps/dashboard/.next/BUILD_ID" || { echo "FATAL: .next/BUILD_ID missing — re-upload first"; exit 1; }
echo "  BUILD_ID = $(cat "$PROJECT/apps/dashboard/.next/BUILD_ID")"

echo
echo "--- PM2 restart spm-dashboard ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$NVM_DIR_PATH\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-dashboard --update-env
  pm2 save
  sleep 3
  pm2 status
"

echo
echo "--- Health probes ---"
for url in \
  "https://dashboard.spw-ai.com" \
  "https://api.spw-ai.com/api/v1/labels" \
; do
  code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "$url" || echo 000)
  printf '  %-50s %s\n' "GET $url" "$code"
done

echo
echo "--- Last 20 lines of dashboard log ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$NVM_DIR_PATH\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 logs spm-dashboard --lines 20 --nostream || true
"

echo
echo "=== Done. Output: $OUT_FILE ==="
