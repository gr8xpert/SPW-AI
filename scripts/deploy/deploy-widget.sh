#!/usr/bin/env bash
# Deploy the SPW widget bundle to public webroot.
#
# Workflow:
#   1. Locally:  pnpm --filter widget build
#   2. SFTP:     upload apps/widget/dist/*  →  httpdocs/spw/apps/widget/dist/
#                (same location as the rest of the repo — keeps SFTP layout consistent)
#   3. SSH root: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/deploy-widget.sh
#                (this script syncs dist/ → httpdocs/widget/ for the public URL)
#
# Resulting URL: https://spw-ai.com/widget/spm-widget.umd.js

set -uo pipefail

SRC_DIST="/var/www/vhosts/spw-ai.com/httpdocs/spw/apps/widget/dist"
WEBROOT="/var/www/vhosts/spw-ai.com/httpdocs/widget"
OUT_FILE="${OUT_FILE:-/var/www/vhosts/spw-ai.com/httpdocs/deploy-widget-output.txt}"
SITE_USER="spw-ai.com_owyn3ig1vb"

mkdir -p "$(dirname "$OUT_FILE")" 2>/dev/null || true
exec > >(tee "$OUT_FILE") 2>&1

echo "=== deploy-widget.sh @ $(date) ==="
echo "  SRC_DIST=$SRC_DIST"
echo "  WEBROOT=$WEBROOT"
echo

test -d "$SRC_DIST" || { echo "FATAL: $SRC_DIST missing — upload apps/widget/dist/ first"; exit 1; }
test -r "$SRC_DIST/spm-widget.umd.js" || { echo "FATAL: spm-widget.umd.js missing in source"; exit 1; }

echo "--- Sync $SRC_DIST → $WEBROOT ---"
mkdir -p "$WEBROOT"
# rsync if available (handles deletes cleanly), else cp
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$SRC_DIST/" "$WEBROOT/"
else
  rm -rf "$WEBROOT"/*
  cp -a "$SRC_DIST"/. "$WEBROOT/"
fi

test -r "$WEBROOT/spm-widget.umd.js" || { echo "FATAL: sync failed — umd missing in webroot"; exit 1; }

chown -R "$SITE_USER:psacln" "$WEBROOT" 2>/dev/null || true
find "$WEBROOT" -type d -exec chmod 755 {} \;
find "$WEBROOT" -type f -exec chmod 644 {} \;

echo "  files:  $(find "$WEBROOT" -type f | wc -l)"
echo "  size:   $(du -sh "$WEBROOT" | cut -f1)"
echo "  umd:    $(ls -lh "$WEBROOT/spm-widget.umd.js" | awk '{print $5}')"
echo

echo "--- Health probe ---"
for url in \
  "https://spw-ai.com/widget/spm-widget.umd.js" \
; do
  code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "$url" || echo 000)
  printf '  %-60s %s\n' "GET $url" "$code"
done

echo
echo "=== Done. Embed snippet for client site:"
cat <<'SNIPPET'

  <script>
    window.RealtySoftConfig = {
      apiUrl: 'https://api.spw-ai.com',
      apiKey: 'spm_4d18a87cc7f1b9d2366047b1a905ae53ea26561d36b7e23d1c99affa87ad5fe8',
      currency: 'EUR',
      language: 'en',
      locale: 'en-US',
      resultsPerPage: 12,
      enableFavorites: true,
      enableCurrency: true,
      enabledListingTypes: ['sale', 'rent', 'offplan'],
      propertyDetailUrl: '/property/',
    };
  </script>

  <div data-spm-widget="search-template-01"></div>
  <div data-spm-widget="listing-template-03"></div>

  <script src="https://spw-ai.com/widget/spm-widget.umd.js"></script>
SNIPPET
