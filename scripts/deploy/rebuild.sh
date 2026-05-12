#!/bin/bash
# Rebuild dashboard with production env vars
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/rebuild-dashboard.sh

PROJECT="/var/www/vhosts/spw-ai.com/spw"
LOG="$PROJECT/rebuild-dashboard.log"
HOME_DIR="/var/www/vhosts/spw-ai.com"

export NVM_DIR="$HOME_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "=== Dashboard rebuild started at $(date) ===" | tee "$LOG"
echo "" | tee -a "$LOG"

cd "$PROJECT"

echo "--- Building Dashboard ---" | tee -a "$LOG"
pnpm build:dashboard >> "$LOG" 2>&1
CODE=$?

if [ $CODE -eq 0 ]; then
    echo "[OK] Dashboard built successfully" | tee -a "$LOG"
else
    echo "[FAILED] exit code $CODE — check $LOG" | tee -a "$LOG"
    exit 1
fi

echo "" | tee -a "$LOG"
if [ -f "$PROJECT/apps/dashboard/.next/BUILD_ID" ]; then
    echo "[OK] BUILD_ID exists — rebuild complete" | tee -a "$LOG"
else
    echo "[FAIL] BUILD_ID missing" | tee -a "$LOG"
fi

echo "" | tee -a "$LOG"
echo "=== Done at $(date). Run step4-migrate.php next ===" | tee -a "$LOG"
