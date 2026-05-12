#!/bin/bash
# Kill root PM2 processes so they don't conflict with site-user PM2
# Run from root SSH: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/kill-root-pm2.sh

echo "=== Killing root PM2 ==="
pm2 delete all 2>/dev/null || true
pm2 kill 2>/dev/null || true
echo "[OK] Root PM2 stopped"

echo ""
echo "=== Fixing log file ownership ==="
PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
SITE_USER=$(stat -c '%U' "$PROJECT/package.json")
echo "Site user: $SITE_USER"

rm -rf "$PROJECT/logs"
mkdir -p "$PROJECT/logs"
chown "$SITE_USER:psacln" "$PROJECT/logs"

rm -rf "$PROJECT/apps/dashboard/logs"
mkdir -p "$PROJECT/apps/dashboard/logs"
chown "$SITE_USER:psacln" "$PROJECT/apps/dashboard/logs"

echo "[OK] Log directories recreated with correct ownership"
echo ""
echo "Now run step5-pm2.php?action=start from the browser to start as site user."
