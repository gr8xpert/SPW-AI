# Server Post-Deploy Validation Checklist

Date: 2026-05-13

Use this after uploading the build artifacts and before opening the system to
real users. It turns the master fix list into server-side checks. Capture the
command output in the deploy ticket.

Do not run destructive tests against a real tenant unless the row says it is
safe. For create/update/inquiry/feed tests, use a disposable tenant and a
disposable property.

## Placeholders

Set these in your shell or replace them manually in the commands below:

```bash
export API_URL="https://api.spw-ai.com"
export DASHBOARD_URL="https://spw-ai.com"
export TENANT_API_KEY="replace-with-test-tenant-widget-api-key"
export TENANT_API_KEY_2="replace-with-second-test-tenant-widget-api-key"
export DASHBOARD_BEARER="Bearer replace-with-dashboard-jwt-if-using-curl"
export TEST_PROPERTY_REF="replace-with-existing-property-reference"
export TEST_LICENSE_KEY="replace-with-test-license-key"

export DATABASE_NAME="spw_v2"
export DATABASE_USER="spw_user"
```

## Go / No-Go Gates

- [ ] Database backup taken before migrations.
- [ ] `ENCRYPTION_KEY` confirmed present and unchanged from the old server.
- [ ] `TRUST_PROXY` configured safely, not `true`, `*`, or `all` in production.
- [ ] `pnpm db:migrate` exits 0.
- [ ] `pm2 status` shows API and dashboard online and stable.
- [ ] API boot logs show no boot-audit failure.
- [ ] `GET /api/health` returns database and Redis OK.
- [ ] `pnpm --filter api test:e2e` exits 0 on a host with MySQL and Redis up.
- [ ] `pnpm --filter api test:smoke` exits 0 on a host with MySQL and Redis up.
- [ ] P0-08 decision is explicit: either the inquiry webhook is wired through
      the audited webhook service, or a launch exception has Owner, Due date,
      Decision, and Approver filled in the master fix list.

## 1. Server Environment And Boot

Run on the server:

```bash
cd /path/to/spw
node -v
pnpm -v
pm2 status
pm2 logs api --lines 200
```

Expected:

- [ ] API and dashboard processes are online.
- [ ] No repeated restart loop.
- [ ] Logs include `NODE_ENV=production`.
- [ ] Logs include `trust proxy: "loopback"` or the explicit trusted proxy
      value for your topology.
- [ ] Logs do not include boot-audit failures, placeholder-secret failures,
      database errors, Redis errors, or migration retry loops.

Check critical env values without printing secrets:

```bash
grep -E "^(NODE_ENV|API_URL|DASHBOARD_URL|API_BIND_HOST|TRUST_PROXY|DATABASE_HOST|DATABASE_NAME|REDIS_HOST)=" apps/api/.env
grep -E "^(NEXTAUTH_URL|NEXT_PUBLIC_API_URL)=" apps/dashboard/.env.local
test "$(grep '^ENCRYPTION_KEY=' apps/api/.env | cut -d= -f2- | wc -c)" -ge 33 && echo "ENCRYPTION_KEY present"
```

Expected:

- [ ] `NODE_ENV=production`.
- [ ] `DASHBOARD_URL` and `NEXTAUTH_URL` match the public dashboard URL.
- [ ] `API_URL` and `NEXT_PUBLIC_API_URL` point at the public API URL.
- [ ] `TRUST_PROXY=loopback` for nginx on the same host, or an explicit CIDR /
      hop count for another proxy topology.
- [ ] `TRUST_PROXY` is not `true`, `*`, or `all`.
- [ ] `API_BIND_HOST` is either unset or `127.0.0.1` for bare-metal nginx, not
      public-facing unless intentionally containerized.

## 2. Database Migration And Secret Storage

Run:

```bash
mysqldump --single-transaction --routines --triggers --events \
  -u "$DATABASE_USER" -p "$DATABASE_NAME" > "pre_deploy_$(date +%Y%m%d-%H%M).sql"

pnpm db:migrate

mysql -u "$DATABASE_USER" -p "$DATABASE_NAME" -e "
SHOW COLUMNS FROM tenants LIKE 'recaptchaSecretKey';
SHOW COLUMNS FROM tenants LIKE 'inquiryWebhookUrl';
SHOW COLUMNS FROM feed_configs LIKE 'credentials';
SELECT name, timestamp FROM migrations ORDER BY timestamp DESC LIMIT 10;
"
```

Expected:

- [ ] Migration command exits 0.
- [ ] `tenants.recaptchaSecretKey` exists.
- [ ] `tenants.inquiryWebhookUrl` exists.
- [ ] `feed_configs.credentials` is no longer a plain JSON column.
- [ ] Latest migration rows include `1776324000000` and `1776325000000`.

Check that migrated secrets were removed from public settings JSON:

```bash
mysql -u "$DATABASE_USER" -p "$DATABASE_NAME" -e "
SELECT id
FROM tenants
WHERE JSON_EXTRACT(settings, '$.recaptchaSecretKey') IS NOT NULL
   OR JSON_EXTRACT(settings, '$.openRouterApiKey') IS NOT NULL
   OR JSON_EXTRACT(settings, '$.inquiryWebhookUrl') IS NOT NULL
LIMIT 10;
"
```

Expected:

- [ ] Query returns zero rows.

Check encrypted feed credentials without printing values:

```bash
mysql -u "$DATABASE_USER" -p "$DATABASE_NAME" -e "
SELECT
  COUNT(*) AS total_configs,
  SUM(credentials IS NOT NULL AND credentials <> '') AS configured,
  SUM(credentials LIKE 'enc:v1:%') AS encrypted
FROM feed_configs;
"
```

Expected:

- [ ] For every configured credential row, `encrypted` equals `configured`.

## 3. Reverse Proxy And Real Client IP

Confirm nginx forwards client IP:

```bash
grep -R "X-Forwarded-For\|X-Real-IP\|proxy_set_header Host" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null
```

Expected:

- [ ] Nginx sends `X-Forwarded-For`.
- [ ] Nginx sends `X-Real-IP`.
- [ ] API boot log shows a safe trust-proxy value.

From two different external hosts, run this same command at roughly the same
time:

```bash
for i in $(seq 1 35); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "x-api-key: bogus-ip-test-$i" \
    "$API_URL/api/v1/locations"
done | sort | uniq -c
```

Expected:

- [ ] Each host gets its own approximate 30-request anon budget before 429.
- [ ] One host's bogus-key probes do not immediately throttle the other host.
- [ ] API logs, if they include request IPs, show real client IPs, not only
      `127.0.0.1`.

## 4. Core Health And E2E

Run:

```bash
curl -fsS "$API_URL/api/health" | jq .
curl -fsS "$API_URL/api/health/live" | jq .
curl -fsS "$API_URL/api/health/ready" | jq .

pnpm --filter api test:e2e
pnpm --filter api test:smoke
```

Expected:

- [ ] Health returns status OK.
- [ ] Database check is OK.
- [ ] Redis check is OK.
- [ ] E2E exits 0.
- [ ] Smoke exits 0.

## 5. Public Widget API Contract

Run with a valid widget API key:

```bash
curl -i -H "x-api-key: $TENANT_API_KEY" "$API_URL/api/v1/sync-meta"
curl -i -H "x-api-key: $TENANT_API_KEY" "$API_URL/api/v1/labels"
curl -i -H "x-api-key: $TENANT_API_KEY" "$API_URL/api/v1/locations"
curl -i -H "x-api-key: $TENANT_API_KEY" "$API_URL/api/v1/property-types"
curl -i -H "x-api-key: $TENANT_API_KEY" "$API_URL/api/v1/features"
curl -i -H "x-api-key: $TENANT_API_KEY" "$API_URL/api/v1/properties?limit=5&sortBy=create_date_desc"
curl -i -H "x-api-key: $TENANT_API_KEY" "$API_URL/api/v1/properties?limit=5&sortBy=list_price"
curl -i -H "x-api-key: $TENANT_API_KEY" "$API_URL/api/v1/properties?limit=5&sortBy=list_price_desc"
curl -i -H "x-api-key: $TENANT_API_KEY" "$API_URL/api/v1/properties/$TEST_PROPERTY_REF"
curl -i -H "x-api-key: $TENANT_API_KEY" "$API_URL/api/v1/properties/$TEST_PROPERTY_REF/similar"
```

Expected:

- [ ] Valid key returns 200 for lookup/search endpoints.
- [ ] Widget sort values do not return 400.
- [ ] Similar endpoint returns 200 or a clean empty result, not 404/500 for an
      existing property reference.
- [ ] Response bodies contain only this tenant's data.

Run with no key and an invalid key:

```bash
curl -i "$API_URL/api/v1/locations"
curl -i -H "x-api-key: definitely-invalid" "$API_URL/api/v1/locations"
```

Expected:

- [ ] Missing/invalid key returns 401 or 429, never 500.
- [ ] Error body does not reveal whether a tenant exists, is inactive, expired,
      or has widget disabled.

## 6. CORS Boundaries

Public widget routes should allow tenant websites but not credentials:

```bash
curl -i -X OPTIONS "$API_URL/api/v1/properties" \
  -H "Origin: https://tenant-example.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-api-key"
```

Expected:

- [ ] `Access-Control-Allow-Origin` reflects `https://tenant-example.com`.
- [ ] `Access-Control-Allow-Credentials` is absent or false.

Dashboard routes should not allow arbitrary tenant origins:

```bash
curl -i -X OPTIONS "$API_URL/api/dashboard/tenant" \
  -H "Origin: https://tenant-example.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization"
```

Expected:

- [ ] Arbitrary origin is not allowed for dashboard routes.
- [ ] Dashboard still works from `$DASHBOARD_URL`.

## 7. API-Key Throttling And License Throttling

Safe anonymous bucket check:

```bash
for i in $(seq 1 35); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "x-api-key: bogus-throttle-$i" \
    "$API_URL/api/v1/locations"
done | sort | uniq -c
```

Expected:

- [ ] About 30 responses are 401.
- [ ] Remaining responses are 429.
- [ ] No 500s.

License endpoint throttle check. Run only once per minute from one client:

```bash
for i in $(seq 1 25); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Content-Type: application/json" \
    -d "{\"licenseKey\":\"bogus-$i\",\"domain\":\"example.com\"}" \
    "$API_URL/api/v1/license/validate"
done | sort | uniq -c
```

Expected:

- [ ] Endpoint starts returning 429 after the configured cap.
- [ ] Invalid license responses are uniform and do not leak tenant/license
      state.

## 8. Tenant Entitlement And Add-On Enforcement

Use one tenant with each add-on enabled and one tenant without the add-on.
Test through the dashboard UI first, then API if you have a bearer token:

```bash
curl -i -H "Authorization: $DASHBOARD_BEARER" "$API_URL/api/dashboard/team"
curl -i -H "Authorization: $DASHBOARD_BEARER" "$API_URL/api/dashboard/email-config"
curl -i -H "Authorization: $DASHBOARD_BEARER" "$API_URL/api/dashboard/feed-export"
curl -i -H "Authorization: $DASHBOARD_BEARER" "$API_URL/api/dashboard/ai-chat/stats"
```

Expected:

- [ ] Tenant without add-on gets 403 for protected endpoints.
- [ ] Tenant with add-on gets normal 200/empty state.
- [ ] Dashboard does not expose a working bypass for disabled add-ons.

Widget entitlement checks:

- [ ] Valid active tenant with `widgetEnabled=true` can use widget endpoints.
- [ ] Inactive tenant API key returns 401.
- [ ] Expired subscription returns 401.
- [ ] `widgetEnabled=false` returns 401.
- [ ] All four failure modes use the same public-facing error shape.

## 9. Property Quota

Use a disposable tenant with a low `maxProperties` plan limit.

Manual create:

- [ ] Create properties until the tenant reaches the plan limit.
- [ ] Attempt one more `POST /api/dashboard/properties`.
- [ ] Expected: 403 with `PLAN_QUOTA_EXCEEDED`.
- [ ] Expected: no extra property row is created.

Feed import overflow:

- [ ] Run a feed import that contains more properties than the tenant quota.
- [ ] Expected: existing allowed rows import.
- [ ] Expected: overflow rows are skipped and recorded as errors.
- [ ] Expected: total active property count does not exceed the plan limit.

## 10. Tenant Settings And Secret Leakage

Dashboard UI:

- [ ] Open Settings as tenant admin.
- [ ] Secret fields show configured/masked state, not raw values.
- [ ] Saving unrelated settings does not clear existing secrets.
- [ ] Updating a secret changes the configured state and does not echo the raw
      value back in later responses.

API checks:

```bash
curl -s -H "Authorization: $DASHBOARD_BEARER" "$API_URL/api/dashboard/tenant" | jq .
curl -s -H "Authorization: $DASHBOARD_BEARER" "$API_URL/api/dashboard/tenant/api-credentials" | jq .
```

Expected:

- [ ] Tenant response does not include raw `recaptchaSecretKey`.
- [ ] Tenant response does not include raw OpenRouter API key.
- [ ] Tenant response does not include raw `inquiryWebhookUrl` inside
      `settings`.
- [ ] API credentials response includes `apiKeyLast4` and
      `webhookSecretLast4`.
- [ ] API credentials response does not include full `webhookSecret`.

## 11. Webhook URL SSRF And Delivery

Main webhook URL validation through dashboard settings:

- [ ] Save `file:///etc/passwd` as webhook URL. Expected: rejected.
- [ ] Save `http://127.0.0.1:80/test` as webhook URL. Expected: rejected.
- [ ] Save `http://127.1.2.3/test` as webhook URL. Expected: rejected.
- [ ] Save `http://169.254.169.254/latest/meta-data` as webhook URL.
      Expected: rejected.
- [ ] Save `http://[::ffff:127.0.0.1]/test` as webhook URL. Expected:
      rejected.
- [ ] Save a real public request-bin URL. Expected: accepted.

Main webhook delivery:

- [ ] Click webhook test or trigger a property change.
- [ ] Request-bin receives a POST.
- [ ] Signature headers are present.
- [ ] `GET /api/dashboard/tenant/webhook/deliveries` shows a delivery row.
- [ ] Redeliver endpoint works for the delivery.

Dedicated inquiry webhook:

- [ ] Confirm the P0-08 decision is recorded before live traffic.
- [ ] Save private/loopback inquiry webhook URL. Expected: rejected.
- [ ] Save public inquiry webhook URL on a disposable tenant. Expected:
      accepted.
- [ ] Submit a test inquiry. Expected: request-bin receives a POST.
- [ ] If P0-08 is still a launch exception, expected: no `WebhookDelivery`
      audit row for the dedicated inquiry webhook because it is still direct
      fetch. This must be understood and accepted by the approver.

## 12. Inquiry, Email Escaping, And Duplicate Suppression

Use a disposable tenant with test email/webhook destinations.

Submit an inquiry with obvious HTML:

```bash
curl -i -H "x-api-key: $TENANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"<script>alert(1)</script>",
    "email":"server-validation@example.com",
    "phone":"<img src=x onerror=alert(1)>",
    "message":"Hello <b>world</b>",
    "propertyId":"'"$TEST_PROPERTY_REF"'"
  }' \
  "$API_URL/api/v1/inquiry"
```

Expected:

- [ ] API returns success or a clean validation error, not 500.
- [ ] Lead is created only for the disposable tenant.
- [ ] Received email displays the text escaped, not as executable HTML.
- [ ] Main webhook receives `lead.created` if configured.

Duplicate check:

- [ ] Submit the same inquiry email/property twice within 10 minutes.
- [ ] Expected: duplicate suppression prevents unbounded duplicate leads.
- [ ] Repeat through share-favorites endpoint with the same email within 10
      minutes. Expected: duplicate suppression applies there too.

## 13. Feed Scheduler, Jobs, And Locks

Safe observation checks:

```bash
pm2 logs api --lines 200 | grep -i "feed"
redis-cli -h "$REDIS_HOST" -p "${REDIS_PORT:-6379}" keys '*feed*' | head
```

Expected:

- [ ] No repeated duplicate feed import jobs for the same config/window.
- [ ] No scheduler errors in logs.
- [ ] Queue depth is stable after deploy.

Controlled feed test on disposable tenant:

- [ ] Configure one due feed import.
- [ ] Let the hourly scheduler run, or trigger the configured sync manually.
- [ ] Expected: one import log enters running/completed for the config/window.
- [ ] Expected: no duplicate BullMQ jobs with the same config/window.
- [ ] Expected: stale running import older than the documented threshold can be
      superseded, but a fresh running import cannot be duplicated.

## 14. AI Model And OpenRouter Config

Run only if AI features are enabled for the test tenant:

- [ ] `OPENROUTER_DEFAULT_MODEL` and `OPENROUTER_ENRICHMENT_MODEL` are set in
      production env if you do not want the hardcoded fallback models.
- [ ] Dashboard AI chat works for a tenant with the add-on.
- [ ] Dashboard AI chat is 403/hidden for a tenant without the add-on.
- [ ] AI enrichment uses the configured model and does not crash when tenant
      OpenRouter key is absent.

## 15. Dashboard Flow Smoke

In a browser:

- [ ] Login works.
- [ ] Logout works.
- [ ] Dashboard loads without 500s.
- [ ] Settings page loads and saves non-secret settings.
- [ ] Properties list loads.
- [ ] Create property works for tenant below quota.
- [ ] Property search/filter/sort works.
- [ ] Locations, property types, features, and labels pages load.
- [ ] Leads page shows the test inquiry.
- [ ] Webhook deliveries page loads.
- [ ] Super-admin clients page loads for super-admin only.
- [ ] Regular tenant cannot open super-admin routes.

## 16. Widget Browser Smoke

On a page using the deployed widget bundle:

- [ ] Widget JS loads from the expected `spm-widget` artifact path.
- [ ] Search renders properties.
- [ ] Sort controls work for `create_date_desc`, `list_price`, and
      `list_price_desc`.
- [ ] Filters using location/property type/features return sane results.
- [ ] Property detail opens.
- [ ] Similar listings render on detail page.
- [ ] Favorites add/remove works.
- [ ] Share favorites works for test email.
- [ ] Inquiry form submits successfully for a disposable tenant.
- [ ] Browser console has no fatal API/CORS errors.

## 17. Rollback Readiness

Before declaring the deploy complete:

- [ ] Previous `apps/api/dist/` artifact is saved.
- [ ] Previous `apps/dashboard/.next/` artifact is saved.
- [ ] Previous `apps/widget/dist/` artifact is saved.
- [ ] Previous `packages/shared/dist/` artifact is saved.
- [ ] Fresh database backup exists and is restorable.
- [ ] Operator knows that secret-splitting/encryption migrations are not safely
      reversible by a blind `migration:revert`; use DB restore if rollback must
      cross those migrations.
- [ ] `pm2 save` run after final successful restart.

## Final Approval

Do not approve deploy until these are true:

- [ ] All Go / No-Go Gates are checked.
- [ ] E2E and smoke tests passed with server dependencies up.
- [ ] Trust-proxy behavior verified from at least two client IPs.
- [ ] P0-08 is either fixed or formally accepted as a launch exception.
- [ ] No unexpected 500s in API logs after the validation run.
- [ ] Rollback artifacts and backup are available.
