#!/bin/bash
# Verify the new dashboard src files actually exist on the server.
# bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/check-src.sh

P="/var/www/vhosts/spw-ai.com/httpdocs/spw/apps/dashboard/src"

echo "=== Required files on server ==="
for f in \
  "components/locked-feature-dialog.tsx" \
  "components/locked-route-guard.tsx" \
  "components/locked-route-screen.tsx" \
  "components/layout/sidebar.tsx" \
  "hooks/use-dashboard-addons.ts"; do
  if [ -f "$P/$f" ]; then
    echo "[OK]    $f  ($(wc -l < $P/$f) lines)"
  else
    echo "[MISS]  $f"
  fi
done

echo ""
echo "=== Sidebar imports useDashboardAddons? ==="
grep -n "useDashboardAddons\|LockedFeatureDialog\|Lock" "$P/components/layout/sidebar.tsx" 2>/dev/null | head -10

echo ""
echo "=== components/ contents ==="
ls -la "$P/components/" 2>/dev/null | grep -v "^total\|^d"

echo ""
echo "=== hooks/ contents ==="
ls -la "$P/hooks/" 2>/dev/null | grep -v "^total\|^d"

echo ""
echo "=== Last dashboard build error (if any) ==="
tail -50 /var/www/vhosts/spw-ai.com/httpdocs/spw/fix-dashboard-api-url.log 2>/dev/null | grep -iE "error|fail|warn" | head -20 || echo "(no log file found)"
