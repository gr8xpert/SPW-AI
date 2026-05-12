#!/bin/bash
# Fix migration: rebuild API and re-run migrations
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/fix-migration.sh

PROJECT="/var/www/vhosts/spw-ai.com/spw"
LOG="$PROJECT/fix-migration.log"
HOME_DIR="/var/www/vhosts/spw-ai.com"

export NVM_DIR="$HOME_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "=== Fix migration started at $(date) ===" | tee "$LOG"

cd "$PROJECT"

echo "--- Rebuild API ---" | tee -a "$LOG"
pnpm build:api >> "$LOG" 2>&1
if [ $? -eq 0 ]; then
    echo "[OK] API built" | tee -a "$LOG"
else
    echo "[FAILED] API build failed — check $LOG" | tee -a "$LOG"
    exit 1
fi

echo "" | tee -a "$LOG"
echo "--- Run migrations ---" | tee -a "$LOG"
pnpm db:migrate >> "$LOG" 2>&1
if [ $? -eq 0 ]; then
    echo "[OK] Migrations complete" | tee -a "$LOG"
else
    echo "[FAILED] Migration failed — check $LOG" | tee -a "$LOG"
    exit 1
fi

echo "" | tee -a "$LOG"
echo "--- Seed default data ---" | tee -a "$LOG"
pnpm db:seed >> "$LOG" 2>&1
if [ $? -eq 0 ]; then
    echo "[OK] Seed complete" | tee -a "$LOG"
else
    echo "[WARNING] Seed failed (non-fatal)" | tee -a "$LOG"
fi

echo "" | tee -a "$LOG"
echo "=== Done at $(date). Run step5-pm2.php next ===" | tee -a "$LOG"
