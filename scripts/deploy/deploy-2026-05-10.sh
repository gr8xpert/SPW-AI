#!/bin/bash
# SPW deploy 2026-05-10
#
# What's in this release:
#   - Paddle removed; Stripe handles plan subs (recurring) + credit packs (one-time)
#   - Kyero + Odoo feed adapters
#   - Image storage routing: feed CDN by default, R2 with dedup when toggled
#   - Per-client dashboard add-on locks (Add Property, Email Campaigns, Feed Export, Team, AI Chat)
#   - Credit pack quantity selector
#
# How to run:
#   1. FTP/SFTP-upload the changed files to httpdocs/spw/  (see deploy guide for list)
#   2. SSH as root: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/deploy-2026-05-10.sh
#
# The script auto-aborts on the first failure that would leave the server
# in an unsafe state. Migrations run before PM2 restart so a migration
# error does NOT crash the running API.

set -e
set -o pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
SITE_USER="spw-ai.com_owyn3ig1vb"
HOME_DIR="/var/www/vhosts/spw-ai.com"
ENV_FILE="$PROJECT/apps/api/.env"
LOG="$PROJECT/deploy-2026-05-10.log"
TS=$(date +%Y%m%d-%H%M%S)

if [ ! -d "$PROJECT" ]; then
  echo "ABORT: project dir $PROJECT does not exist"
  exit 1
fi

cd "$PROJECT"
exec > >(tee -a "$LOG") 2>&1

echo "================================================================"
echo " SPW Deploy 2026-05-10  —  started $(date)"
echo "================================================================"

# ---------------------------------------------------------------------
# 1. Pre-flight: assert FTP upload completed
# ---------------------------------------------------------------------
echo ""
echo "--- 1. Pre-flight: required files present ---"

required=(
  "apps/api/dist/main.js"
  "apps/api/dist/database/migrations/1776315900000-ContentHashAndIndexes.js"
  "apps/api/dist/database/migrations/1776317000000-PaddleToStripe.js"
  "apps/api/dist/database/migrations/1776318000000-FeedProviderKyeroOdoo.js"
  "apps/api/dist/database/migrations/1776319000000-PropertySourceAndThumbnails.js"
  "apps/api/dist/database/migrations/1776320000000-FeedImagesToR2AndMediaBlobs.js"
  "apps/api/dist/database/migrations/1776321000000-DashboardAddons.js"
  "apps/api/dist/modules/payment/stripe-subscription.service.js"
  "apps/api/dist/modules/feed/adapters/kyero.adapter.js"
  "apps/api/dist/modules/feed/adapters/odoo.adapter.js"
  "apps/api/dist/database/entities/media-blob.entity.js"
  "apps/dashboard/.next/BUILD_ID"
  "apps/dashboard/.next/server/app/(dashboard)/dashboard/properties/page.js"
  "packages/shared/dist/index.js"
)

missing=0
for f in "${required[@]}"; do
  if [ ! -f "$PROJECT/$f" ]; then
    echo "  [FAIL] missing: $f"
    missing=$((missing+1))
  fi
done

if [ $missing -gt 0 ]; then
  echo ""
  echo "ABORT: $missing required files missing. Re-upload via FTP and try again."
  exit 1
fi
echo "  [OK] all required files present"

# Stale Paddle files: warn but don't abort. NestJS doesn't load them
# anymore (payment.module.ts no longer imports them) but they should
# be deleted via FTP for cleanliness.
echo ""
echo "--- 1b. Stale Paddle files (delete via FTP after deploy) ---"
stale_count=0
for f in \
    "apps/api/dist/modules/payment/paddle-checkout.service.js" \
    "apps/api/dist/modules/payment/paddle-signature.js" \
    "apps/api/dist/modules/payment/paddle-webhook.controller.js" \
    "apps/api/dist/modules/payment/paddle-webhook.service.js" \
    "apps/api/dist/database/entities/processed-paddle-event.entity.js" \
    "apps/api/dist/database/migrations/1776304900000-ProcessedPaddleEvents.js" \
    "apps/api/dist/database/migrations/1776305900000-PlanPaddlePriceIds.js"; do
  if [ -f "$PROJECT/$f" ]; then
    echo "  [WARN] stale: $f"
    stale_count=$((stale_count+1))
  fi
done
if [ $stale_count -eq 0 ]; then
  echo "  [OK] no stale Paddle files"
fi

# ---------------------------------------------------------------------
# 2. Stripe env vars (interactive prompt if missing)
# ---------------------------------------------------------------------
echo ""
echo "--- 2. Stripe env vars ---"

if [ ! -f "$ENV_FILE" ]; then
  echo "  [FAIL] $ENV_FILE not found"
  exit 1
fi

env_get() {
  grep -E "^${1}=" "$ENV_FILE" | head -1 | cut -d= -f2- || true
}

env_set() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    # Use | as delimiter since values may contain /
    local escaped=$(printf '%s\n' "$val" | sed 's/[&|\]/\\&/g')
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

CURRENT_KEY=$(env_get STRIPE_SECRET_KEY)
CURRENT_WHSEC=$(env_get STRIPE_WEBHOOK_SECRET)

if [ -z "$CURRENT_KEY" ] || [ -z "$CURRENT_WHSEC" ]; then
  echo "  Stripe keys missing or empty. Get them from:"
  echo "    https://dashboard.stripe.com/apikeys           (secret key)"
  echo "    https://dashboard.stripe.com/webhooks          (signing secret)"
  echo ""
  cp "$ENV_FILE" "$ENV_FILE.bak-$TS"
  echo "  Backed up .env to $ENV_FILE.bak-$TS"
  echo ""

  if [ -z "$CURRENT_KEY" ]; then
    read -r -p "  STRIPE_SECRET_KEY (sk_live_... or sk_test_...): " STRIPE_KEY
    if [ -z "$STRIPE_KEY" ]; then
      echo "  [FAIL] STRIPE_SECRET_KEY required. Aborting."
      exit 1
    fi
    env_set STRIPE_SECRET_KEY "$STRIPE_KEY"
  fi

  if [ -z "$CURRENT_WHSEC" ]; then
    read -r -p "  STRIPE_WEBHOOK_SECRET (whsec_...): " STRIPE_WHSEC
    if [ -z "$STRIPE_WHSEC" ]; then
      echo "  [FAIL] STRIPE_WEBHOOK_SECRET required. Aborting."
      exit 1
    fi
    env_set STRIPE_WEBHOOK_SECRET "$STRIPE_WHSEC"
  fi

  echo "  [OK] .env updated"
else
  echo "  [OK] STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET both set"
fi

# Default the optional vars if absent (idempotent)
[ -z "$(env_get STRIPE_SUCCESS_URL)" ] && env_set STRIPE_SUCCESS_URL "https://dashboard.spw-ai.com"
[ -z "$(env_get STRIPE_CANCEL_URL)"  ] && env_set STRIPE_CANCEL_URL  "https://dashboard.spw-ai.com"
[ -z "$(env_get STRIPE_GRACE_DAYS)"  ] && env_set STRIPE_GRACE_DAYS  "7"

# Strip stale PADDLE_* lines (Paddle removed)
if grep -q "^PADDLE_" "$ENV_FILE"; then
  cp "$ENV_FILE" "$ENV_FILE.bak-$TS-paddle-strip"
  sed -i '/^PADDLE_/d' "$ENV_FILE"
  echo "  [OK] stripped stale PADDLE_* lines"
fi

# ---------------------------------------------------------------------
# 3. Run migrations BEFORE restarting PM2
#    Order matters: if migration fails, the running API keeps working
#    against the old schema until we fix the issue and re-run.
# ---------------------------------------------------------------------
echo ""
echo "--- 3. Running database migrations ---"

set +e
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  npx --yes typeorm migration:run -d apps/api/dist/config/database.config.js 2>&1
"
MIG_EXIT=$?
set -e

if [ $MIG_EXIT -ne 0 ]; then
  echo ""
  echo "[FAIL] migrations exited $MIG_EXIT — DO NOT restart PM2."
  echo "       Existing API is still running on the OLD schema."
  echo "       Inspect the error above, fix, then re-run this script."
  exit $MIG_EXIT
fi
echo "  [OK] all migrations applied"

# ---------------------------------------------------------------------
# 4. Restart PM2 with new code
# ---------------------------------------------------------------------
echo ""
echo "--- 4. Restarting PM2 ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pm2 restart ecosystem.config.js --env production
  sleep 8
  pm2 status
"

# ---------------------------------------------------------------------
# 5. Health checks
# ---------------------------------------------------------------------
echo ""
echo "--- 5. Health checks ---"
sleep 2

# Local loopback (PM2 binds to 127.0.0.1; nginx fronts these)
API_PORT=3001
DASH_PORT=3000

API_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${API_PORT}/api/health" 2>/dev/null || echo "000")
DASH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${DASH_PORT}" 2>/dev/null || echo "000")
WH_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "http://127.0.0.1:${API_PORT}/api/webhooks/stripe" 2>/dev/null || echo "000")

printf "  API   /api/health         : %s  (expect 200)\n" "$API_CODE"
printf "  Dash  /                   : %s  (expect 200 or 307 redirect)\n" "$DASH_CODE"
printf "  Webhook /api/webhooks/stripe: %s  (expect 401 — handler exists, signature missing on empty body)\n" "$WH_CODE"

# Boot audit success line should appear within last 100 log lines
echo ""
echo "  Boot audit (last 100 lines of API log):"
set +e
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 logs spw-api --lines 100 --nostream 2>/dev/null | grep -E 'boot security audit|boot audit' || \
  pm2 logs --lines 100 --nostream 2>/dev/null | grep -E 'boot security audit|boot audit' || true
" | sed 's/^/    /'
set -e

# ---------------------------------------------------------------------
# 6. Done
# ---------------------------------------------------------------------
echo ""
echo "================================================================"
echo " Deploy 2026-05-10 finished $(date)"
echo "================================================================"
echo ""
echo "POST-DEPLOY CHECKLIST (do these in the browser):"
echo "  1. Super-admin → Plans → edit each plan → paste Stripe price IDs"
echo "     (price_xxx values from https://dashboard.stripe.com/products)"
echo "     Until pasted, plan checkout returns 400 'no Stripe price configured'"
echo ""
echo "  2. Super-admin → Clients → edit a client:"
echo "     - 'Download Feed Images to R2' toggle present (default OFF)"
echo "     - 'Dashboard Add-ons' card with 5 toggles (default all OFF)"
echo ""
echo "  3. Log in as a tenant (non-admin):"
echo "     - Sidebar shows lock icons on Email Campaigns, Feed Export,"
echo "       Team, AI Chat"
echo "     - Clicking a locked item opens upgrade dialog (no navigation)"
echo "     - /dashboard/campaigns directly → Locked feature screen"
echo ""
echo "  4. Stripe dashboard → Webhooks → your endpoint → Send test"
echo "     event 'checkout.session.completed' → expect 200 OK"
echo ""
echo "Log saved to: $LOG"
echo ""
echo "ROLLBACK:"
echo "  - DB: revert migrations one-by-one until you reach a known-good state:"
echo "      cd $PROJECT"
echo "      su - $SITE_USER -s /bin/bash -c 'cd $PROJECT && \\"
echo "        npx typeorm migration:revert -d apps/api/dist/config/database.config.js'"
echo "      (run 6× to revert all of this release's migrations)"
echo "  - Code: re-upload your previous dist/, then 'pm2 restart ecosystem.config.js'"
