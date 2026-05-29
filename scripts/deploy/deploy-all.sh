#!/usr/bin/env bash
# Combined deploy: widget bundle (sync to webroot) + API (PM2 restart).
#
# Prerequisite (do this BEFORE running):
#   SFTP upload these locally-built folders:
#     apps/widget/dist/*  →  httpdocs/spw/apps/widget/dist/
#     apps/api/dist/*     →  httpdocs/spw/apps/api/dist/
#
# Then SSH as root:
#   bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/deploy-all.sh

set -uo pipefail

REPO_ROOT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
WIDGET_SRC="$REPO_ROOT/apps/widget/dist"
WIDGET_WEBROOT="/var/www/vhosts/spw-ai.com/httpdocs/widget"
API_SRC="$REPO_ROOT/apps/api/dist"
PM2_NAME="spm-api"
SITE_USER="spw-ai.com_owyn3ig1vb"
NVM_DIR="/var/www/vhosts/spw-ai.com/.nvm"
OUT_FILE="${OUT_FILE:-/var/www/vhosts/spw-ai.com/httpdocs/deploy-all-output.txt}"

mkdir -p "$(dirname "$OUT_FILE")" 2>/dev/null || true
exec > >(tee "$OUT_FILE") 2>&1

echo "=== deploy-all.sh @ $(date) ==="
echo "  REPO_ROOT=$REPO_ROOT"
echo

# ─── Widget ──────────────────────────────────────────────────────────────────
echo "--- [1/2] Widget bundle ---"
test -d "$WIDGET_SRC" || { echo "FATAL: $WIDGET_SRC missing — upload apps/widget/dist/ first"; exit 1; }
test -r "$WIDGET_SRC/spm-widget.umd.js" || { echo "FATAL: spm-widget.umd.js missing in widget source"; exit 1; }

mkdir -p "$WIDGET_WEBROOT"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$WIDGET_SRC/" "$WIDGET_WEBROOT/"
else
  rm -rf "$WIDGET_WEBROOT"/*
  cp -a "$WIDGET_SRC"/. "$WIDGET_WEBROOT/"
fi
test -r "$WIDGET_WEBROOT/spm-widget.umd.js" || { echo "FATAL: widget sync failed"; exit 1; }

chown -R "$SITE_USER:psacln" "$WIDGET_WEBROOT" 2>/dev/null || true
find "$WIDGET_WEBROOT" -type d -exec chmod 755 {} \;
find "$WIDGET_WEBROOT" -type f -exec chmod 644 {} \;

echo "  files:  $(find "$WIDGET_WEBROOT" -type f | wc -l)"
echo "  size:   $(du -sh "$WIDGET_WEBROOT" | cut -f1)"
echo "  umd:    $(ls -lh "$WIDGET_WEBROOT/spm-widget.umd.js" | awk '{print $5}')"
echo

# ─── API ─────────────────────────────────────────────────────────────────────
echo "--- [2/2] API restart ---"
test -d "$API_SRC" || { echo "FATAL: $API_SRC missing — upload apps/api/dist/ first"; exit 1; }
test -r "$API_SRC/main.js" || { echo "FATAL: main.js missing in api dist"; exit 1; }

chown -R "$SITE_USER:psacln" "$API_SRC" 2>/dev/null || true

# PM2 lives inside the site user's NVM — run as that user, not root.
# `--update-env` picks up any new env vars; without it pm2 reuses the cached env.
echo "  restarting pm2 process: $PM2_NAME"
su - "$SITE_USER" -c "export NVM_DIR='$NVM_DIR'; \
  source \"\$NVM_DIR/nvm.sh\"; \
  pm2 restart '$PM2_NAME' --update-env" || {
    echo "FATAL: pm2 restart failed"; exit 1;
  }

# Give Nest a moment to bind before probing
sleep 2

# ─── Health probes ───────────────────────────────────────────────────────────
echo
echo "--- Health probe ---"
for url in \
  "https://spw-ai.com/widget/spm-widget.umd.js" \
  "https://api.spw-ai.com/api/v1/sync-meta" \
  "https://api.spw-ai.com/api/v1/widget-config" \
; do
  code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "$url" || echo 000)
  printf '  %-60s %s\n' "GET $url" "$code"
done
# sync-meta and widget-config will return 401 without an API key — that's
# the success signal (route exists, auth guard reached). 5xx = bad.

echo
echo "=== Done @ $(date) ==="
