#!/usr/bin/env bash
# End-to-end staging test for the SPW Sync WP plugin.
#
# Spins up a fresh WordPress + MySQL pair via docker compose, installs the
# plugin, configures the webhook secret, then exercises every supported
# webhook event type. Verifies:
#   1. /wp-json/spw/v1/ping responds before we touch /sync
#   2. Each event type returns the HTTP status the plugin's contract
#      documents (200 for accepted, 401 for bad signature, etc.)
#   3. spw_sync_version actually advances after a property.updated event
#
# Usage:  ./run.sh [--no-teardown]
# Env:    SPW_WEBHOOK_SECRET   — override the default test secret
#         WP_URL               — override (default http://localhost:8088)
#
# Exits non-zero on any assertion failure. Meant to be CI-runnable.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SECRET="${SPW_WEBHOOK_SECRET:-staging-secret-do-not-use-in-prod-9f7e2c}"
WP_URL="${WP_URL:-http://localhost:8088}"
TEARDOWN=1
[[ "${1:-}" == "--no-teardown" ]] && TEARDOWN=0

log()  { printf '\033[36m[staging]\033[0m %s\n' "$*"; }
pass() { printf '\033[32m  ✓\033[0m %s\n' "$*"; }
fail() { printf '\033[31m  ✗ %s\033[0m\n' "$*"; exit 1; }

cleanup() {
  if [[ "$TEARDOWN" == "1" ]]; then
    log 'tearing down containers'
    docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  else
    log 'leaving containers running (--no-teardown)'
  fi
}
trap cleanup EXIT

# --- bring up stack -------------------------------------------------------

log 'starting wp-mysql + wordpress'
docker compose up -d wp-mysql wordpress >/dev/null

log 'waiting for WordPress to answer on HTTP'
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null "${WP_URL}/wp-login.php" 2>/dev/null; then
    pass "WordPress up at ${WP_URL} (after ${i}s)"
    break
  fi
  sleep 1
  [[ $i -eq 60 ]] && fail 'WordPress did not come up within 60s'
done

# --- install + configure WordPress ---------------------------------------

wp() { docker compose --profile tools run --rm wpcli "$@"; }

log 'installing WordPress'
wp core install \
  --url="${WP_URL}" \
  --title='SPW Staging' \
  --admin_user=admin \
  --admin_password=admin \
  --admin_email=staging@example.com \
  --skip-email >/dev/null

log 'activating spw-sync plugin'
wp plugin activate spw-sync >/dev/null
pass 'plugin active'

log 'configuring webhook secret'
wp option update spw_webhook_secret "$SECRET" >/dev/null
wp option update spw_api_url 'http://spw-api-stub.local' >/dev/null
wp option update spw_api_key 'staging-api-key' >/dev/null

# --- actual webhook contract tests ---------------------------------------

# Build a signed POST. Mirrors apps/api/src/modules/webhook delivery — Stripe
# style `t=<unix>,v1=<hex>` with `hash_hmac('sha256', "$ts.$body", $secret)`.
sign_and_post() {
  local body="$1"
  local ts expected_status="${2:-200}" actual_status sig
  ts=$(date +%s)
  sig=$(printf '%s.%s' "$ts" "$body" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')
  actual_status=$(curl -sS -o /tmp/spw-resp.json -w '%{http_code}' \
    -X POST "${WP_URL}/wp-json/spw/v1/sync" \
    -H 'Content-Type: application/json' \
    -H "X-SPW-Timestamp: ${ts}" \
    -H "X-SPW-Signature: t=${ts},v1=${sig}" \
    --data "$body")
  if [[ "$actual_status" != "$expected_status" ]]; then
    echo "  body: $body"
    echo "  resp: $(cat /tmp/spw-resp.json 2>/dev/null)"
    fail "expected HTTP ${expected_status}, got ${actual_status}"
  fi
}

log 'Test 1: ping is reachable (no auth)'
status=$(curl -sS -o /tmp/spw-resp.json -w '%{http_code}' "${WP_URL}/wp-json/spw/v1/ping")
[[ "$status" == "200" ]] || fail "ping returned ${status}, expected 200"
grep -q '"plugin":"spw-sync"' /tmp/spw-resp.json || fail 'ping response missing plugin identifier'
pass 'ping ok'

log 'Test 2: unsigned webhook is rejected'
bad_status=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "${WP_URL}/wp-json/spw/v1/sync" \
  -H 'Content-Type: application/json' \
  --data '{"event":"test"}')
[[ "$bad_status" == "401" ]] || fail "unsigned request returned ${bad_status}, expected 401"
pass 'unsigned request rejected with 401'

log 'Test 3: tampered signature is rejected'
ts=$(date +%s)
tampered_status=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "${WP_URL}/wp-json/spw/v1/sync" \
  -H 'Content-Type: application/json' \
  -H "X-SPW-Timestamp: ${ts}" \
  -H "X-SPW-Signature: t=${ts},v1=deadbeef" \
  --data '{"event":"test"}')
[[ "$tampered_status" == "401" ]] || fail "tampered signature returned ${tampered_status}, expected 401"
pass 'tampered signature rejected with 401'

log 'Test 4: stale timestamp is rejected (replay protection)'
stale_ts=$(( $(date +%s) - 600 )) # 10 min old
stale_body='{"event":"test"}'
stale_sig=$(printf '%s.%s' "$stale_ts" "$stale_body" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')
stale_status=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "${WP_URL}/wp-json/spw/v1/sync" \
  -H 'Content-Type: application/json' \
  -H "X-SPW-Timestamp: ${stale_ts}" \
  -H "X-SPW-Signature: t=${stale_ts},v1=${stale_sig}" \
  --data "$stale_body")
[[ "$stale_status" == "401" ]] || fail "stale timestamp returned ${stale_status}, expected 401"
pass 'stale timestamp rejected with 401'

log 'Test 5: well-formed test webhook is accepted'
sign_and_post '{"event":"test","message":"hello staging"}'
grep -q '"status":"ok"' /tmp/spw-resp.json || fail 'test webhook response missing status:ok'
pass 'test webhook accepted'

log 'Test 6: property.updated advances spw_sync_version'
prev_version=$(wp option get spw_sync_version 2>/dev/null | tr -d '\r' || echo 0)
sign_and_post '{"event":"property.updated","deliveryId":"stg-1","createdAt":"2026-01-01T00:00:00Z","data":{"syncVersion":42,"propertyId":999}}'
new_version=$(wp option get spw_sync_version | tr -d '\r')
[[ "$new_version" == "42" ]] || fail "spw_sync_version=${new_version}, expected 42 (was ${prev_version})"
pass "spw_sync_version advanced ${prev_version} → 42"

log 'Test 7: cache.invalidated bumps sync_version too'
sign_and_post '{"event":"cache.invalidated","deliveryId":"stg-2","createdAt":"2026-01-01T00:00:00Z","data":{"tenantId":1,"syncVersion":43,"clearedAt":"2026-01-01T00:00:00Z","triggeredBy":"admin"}}'
new_version=$(wp option get spw_sync_version | tr -d '\r')
[[ "$new_version" == "43" ]] || fail "after cache.invalidated spw_sync_version=${new_version}, expected 43"
pass 'cache.invalidated handled, sync_version = 43'

log 'Test 8: unknown event type is ignored, not errored'
sign_and_post '{"event":"some.future.event","data":{}}' 200
grep -q '"status":"ignored"' /tmp/spw-resp.json || fail 'unknown event should respond status:ignored'
pass 'unknown event ignored gracefully'

log 'all staging tests passed'
