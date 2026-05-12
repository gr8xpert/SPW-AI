#!/bin/bash
# Verify the addon UI is in the dashboard CLIENT build (not just SSR).
# bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/check-build.sh

P="/var/www/vhosts/spw-ai.com/httpdocs/spw/apps/dashboard/.next"

echo "=== Build ID ==="
cat "$P/BUILD_ID" 2>/dev/null
echo ""

echo "=== Static chunks: addon-related strings ==="
echo ""

# These string literals survive minification (the function/var names don't)
for needle in \
  "is a paid add-on" \
  "is locked" \
  "feedImagesToR2" \
  "Dashboard Add-ons" \
  "dashboardAddons" \
  "Email Campaigns"; do
  hits=$(grep -rl "$needle" "$P/static" 2>/dev/null | wc -l)
  echo "  '$needle' found in $hits chunk(s)"
done

echo ""
echo "=== Sidebar chunk: lock icon path ==="
# Find the chunk that contains the sidebar (it'll have all section titles)
grep -l "Marketing.*Integrations\|Email Campaigns" "$P/static/chunks/"*.js 2>/dev/null | head -3

echo ""
echo "=== Sample: search the layout chunk for lock + dashboardAddons ==="
LAYOUT_CHUNKS=$(grep -rl "Email Campaigns" "$P/static/chunks/" 2>/dev/null | head -2)
for chunk in $LAYOUT_CHUNKS; do
  echo "--- $chunk ---"
  grep -oE 'dashboardAddons|/api/dashboard/tenant|"is a paid add-on"' "$chunk" 2>/dev/null | sort -u
done

echo ""
echo "=== Browser-side hook URL ==="
grep -rl '/api/dashboard/tenant' "$P/static/chunks/" 2>/dev/null | head -3
