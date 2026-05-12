#!/bin/bash
# SPW Build Script — run as site user via SSH
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/build.sh

PROJECT="/var/www/vhosts/spw-ai.com/spw"
LOG="$PROJECT/build.log"
HOME_DIR="/var/www/vhosts/spw-ai.com"

export NVM_DIR="$HOME_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "=== SPW Build started at $(date) ===" | tee "$LOG"
echo "Node: $(node -v) | npm: $(npm -v) | pnpm: $(pnpm -v)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

run() {
    local label="$1"
    shift
    echo "--- $label ---" | tee -a "$LOG"
    echo "> $*" | tee -a "$LOG"
    local start=$(date +%s)
    if "$@" >> "$LOG" 2>&1; then
        local elapsed=$(( $(date +%s) - start ))
        echo "[OK] (${elapsed}s)" | tee -a "$LOG"
    else
        local elapsed=$(( $(date +%s) - start ))
        echo "[FAILED] (${elapsed}s)" | tee -a "$LOG"
        echo "!!! Build failed at: $label. Check $LOG for details." | tee -a "$LOG"
        exit 1
    fi
    echo "" | tee -a "$LOG"
}

cd "$PROJECT"

run "Install dependencies" pnpm install --frozen-lockfile
if [ $? -ne 0 ]; then
    run "Install dependencies (retry without lockfile)" pnpm install
fi

run "Build @spm/shared" pnpm --filter @spm/shared build
run "Build API" pnpm build:api
run "Build Dashboard" pnpm build:dashboard
run "Build Widget" pnpm build:widget

# Create logs directory
mkdir -p "$PROJECT/logs"

# Verify builds
echo "--- Verify builds ---" | tee -a "$LOG"
PASS=true
for check in "apps/api/dist/main.js" "apps/dashboard/.next/BUILD_ID" "apps/widget/dist"; do
    if [ -e "$PROJECT/$check" ]; then
        echo "  [OK] $check" | tee -a "$LOG"
    else
        echo "  [FAIL] $check" | tee -a "$LOG"
        PASS=false
    fi
done

echo "" | tee -a "$LOG"
echo "=== Build finished at $(date) ===" | tee -a "$LOG"
if $PASS; then
    echo "=== ALL BUILDS OK — run step3-env.php next ===" | tee -a "$LOG"
else
    echo "=== SOME BUILDS FAILED — check log above ===" | tee -a "$LOG"
fi
