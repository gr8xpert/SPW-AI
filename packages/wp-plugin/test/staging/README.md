# WP Plugin Staging Harness

End-to-end test harness for the SPW Sync WordPress plugin. Spins up a
disposable WordPress + MySQL pair in Docker, installs the plugin fresh,
and exercises every supported webhook event against the real plugin code
— the goal is to catch regressions that unit tests don't see, like:

- the plugin's REST route registration silently breaking after a WP
  version bump,
- `X-SPW-Signature` parsing regressing when we change the header format
  on the server side,
- HMAC verification accepting or rejecting the wrong requests.

## Prerequisites

- Docker + `docker compose` (v2 plugin, shipped with recent Docker
  Desktop / `docker-compose-plugin` apt package)
- `openssl` and `curl` on the host
- Host port `8088` free

## Running

```bash
cd packages/wp-plugin/test/staging
./run.sh
```

The script spins up the stack, installs WP, activates the plugin, runs
8 assertions, and tears everything down on exit. Non-zero exit = failure.

Pass `--no-teardown` to keep the containers running after the test so you
can poke at `http://localhost:8088/wp-admin` (login `admin` / `admin`).
Tear down manually with `docker compose down -v` when you're done.

## What it verifies

| # | Case | Expected |
|---|---|---|
| 1 | `GET /wp-json/spw/v1/ping` | 200, `"plugin":"spw-sync"` in body |
| 2 | POST to `/sync` with no signature | 401 |
| 3 | POST with a tampered signature | 401 |
| 4 | POST with a 10-minute-old timestamp | 401 (replay guard) |
| 5 | POST `event=test` with a valid v2 signature | 200, `"status":"ok"` |
| 6 | POST `property.updated` with `data.syncVersion=42` | `wp option get spw_sync_version` returns `42` |
| 7 | POST `cache.invalidated` with `syncVersion=43` | `spw_sync_version` advances to `43` |
| 8 | POST an unknown event type | 200, `"status":"ignored"` |

## Using against a custom webhook secret

By default the harness generates a test secret baked into `run.sh`. To
pin one (e.g., when debugging against a specific API tenant's secret):

```bash
SPW_WEBHOOK_SECRET='your-real-tenant-secret' ./run.sh
```

The plugin side uses the same value because `run.sh` calls `wp option
update spw_webhook_secret "$SECRET"` before the tests run.

## Layout

```
test/staging/
├── README.md           # this file
├── docker-compose.yml  # wp + mysql + wpcli
└── run.sh              # full test sequence
```

## Limitations & future work

- This harness does not exercise the **outbound** sync from the plugin
  back to the API (`$sync->sync_all_data()` fetching `/api/v1/sync-meta`
  and `/api/v1/properties`). Those paths require a running API; add a
  second docker-compose profile that starts a real `apps/api` container
  when we want full bidirectional coverage.
- `wp_schedule_single_event('spw_async_sync')` is fired asynchronously,
  so Test 6/7 assert the **option bump** (which happens synchronously in
  the request handler), not the eventual async sync. That's intentional
  — verifying the async callback ran would require running WP-cron on a
  timer and flakes badly in CI.
