# SPW v2 — Backup & Restore Runbook

This runbook targets the on-call engineer. It assumes you have SSH access to the
production host and the ops team's S3 bucket credentials from the password
manager. Written to be followed at 3am — no prior context required.

Companion to `DEPLOYMENT.md`. Read that for the server layout first.

---

## What gets backed up, and what doesn't

| System | Backed up? | Why / recovery path |
|---|---|---|
| MySQL (`spw_v2`) | **Yes — nightly** | Authoritative state. Loss = data loss. |
| `apps/api/uploads/` (property images, attachments) | **Yes — nightly sync** | User-provided content. Loss = missing images, not recoverable. |
| Redis | **No** | Contains only throttler buckets + BullMQ queue state + the distributed cron lock. All ephemeral; rebuilds itself after a restart (worst case: counters reset, a handful of jobs replay). |
| `.env.production` / secrets | **No — in password manager** | Never in backups. If the box is lost, pull from the password manager. |
| Codebase | **No — in Git** | `origin/main` is the source of truth. |
| WP plugin sites (customer WordPress installs) | **No — customer-owned** | Customer's responsibility. We only backup the multi-tenant API. |

Backups live in S3 at `s3://spw-backups-prod/`:

- `mysql/YYYY-MM-DD.sql.gz` — gzipped `mysqldump` output
- `uploads/` — mirror of the `apps/api/uploads/` tree (`aws s3 sync`, not timestamped)

Retention: **14 daily** + **12 monthly** (the 1st of each month is kept for a year,
the rest aged out). S3 lifecycle rules enforce this — see `ops/s3-lifecycle.json`
(to be added when infra-as-code lands; for now configured via the AWS console).

**Targets:**

- RPO (max acceptable data loss): **24 hours** — we accept losing up to a day
  because we run nightly, not continuous, backups. If this becomes too lossy
  switch to MySQL binlog streaming to S3.
- RTO (max acceptable downtime): **1 hour** — a fresh box + the latest dump +
  uploads sync should fit inside that, assuming the backup is not cold-stored.

---

## Nightly backup cron

Runs on the API host at 03:15 UTC (low-traffic window, after log rotation).

Add to root's crontab on the API host:

```cron
15 3 * * * /usr/local/bin/spw-backup.sh >> /var/log/spw-backup.log 2>&1
```

Script at `/usr/local/bin/spw-backup.sh` (owner `root:root`, mode `0700`):

```bash
#!/usr/bin/env bash
# SPW nightly backup. Fails loud (exit non-zero) so cron mails root on failure.
# Idempotent: safe to run ad-hoc mid-day for a pre-change snapshot.
set -euo pipefail

STAMP="$(date -u +%Y-%m-%d)"
BUCKET="s3://spw-backups-prod"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Read MySQL creds from the existing API env file — single source of truth,
# no secret duplication into the cron script. --defaults-extra-file hides the
# password from `ps`.
ENV_FILE="/var/www/vhosts/spw-ai.com/spw/apps/api/.env.production"
# shellcheck disable=SC1090
source <(grep -E '^(DATABASE_(HOST|PORT|USERNAME|PASSWORD|NAME))=' "$ENV_FILE")

MYCNF="$WORK/my.cnf"
cat >"$MYCNF" <<EOF
[client]
host=${DATABASE_HOST}
port=${DATABASE_PORT}
user=${DATABASE_USERNAME}
password=${DATABASE_PASSWORD}
EOF
chmod 0600 "$MYCNF"

# --single-transaction gives a consistent snapshot on InnoDB without locking
# writes. --routines/--triggers/--events keep stored objects. Skip the
# performance_schema-style columns that differ between mysqldump versions.
DUMP="$WORK/${STAMP}.sql"
mysqldump \
  --defaults-extra-file="$MYCNF" \
  --single-transaction \
  --routines --triggers --events \
  --set-gtid-purged=OFF \
  --default-character-set=utf8mb4 \
  "${DATABASE_NAME}" >"$DUMP"

gzip -9 "$DUMP"
aws s3 cp "${DUMP}.gz" "${BUCKET}/mysql/${STAMP}.sql.gz" --storage-class STANDARD_IA

# Uploads: mirror to S3. --delete means the bucket mirrors the live tree; if a
# user deleted an image on the site, yesterday's backup already rolled that
# deletion in. For richer point-in-time recovery, enable S3 Versioning on the
# bucket (recommended; lets you retrieve a deleted object).
aws s3 sync \
  /var/www/vhosts/spw-ai.com/spw/apps/api/uploads/ \
  "${BUCKET}/uploads/" \
  --delete --storage-class STANDARD_IA

echo "[$(date -u +%FT%TZ)] SPW backup ok: mysql/${STAMP}.sql.gz + uploads/"
```

Test the script by running it manually once; confirm the dated `.sql.gz`
shows up in S3 and `uploads/` mirrors correctly. Cron-mail on root is how
failures surface — verify mail delivery works on the host.

---

## On-demand backup (before a risky deploy)

```bash
ssh root@api.spw-ai.com /usr/local/bin/spw-backup.sh
```

Confirm the new `.sql.gz` exists in S3 before proceeding with the risky change.

---

## Restore — dry run (quarterly)

Restore dry-runs catch bit-rot: backups that appear fine in S3 but can't
actually be replayed. Run this once a quarter on a scratch host or in a local
Docker MySQL.

```bash
# On a scratch box (NOT production)
aws s3 cp s3://spw-backups-prod/mysql/$(date -u +%Y-%m-%d).sql.gz .
gunzip $(date -u +%Y-%m-%d).sql.gz

# Spin up a disposable MySQL just for the test
docker run --rm -d --name spw-restore-test \
  -e MYSQL_ROOT_PASSWORD=test \
  -e MYSQL_DATABASE=spw_v2 \
  -p 3307:3306 mysql:8

# Wait for it to be ready, then load
until docker exec spw-restore-test mysqladmin ping -h127.0.0.1 -uroot -ptest &>/dev/null; do sleep 2; done
docker exec -i spw-restore-test mysql -uroot -ptest spw_v2 < $(date -u +%Y-%m-%d).sql

# Sanity checks — adjust counts to what you expect for prod-ish volume
docker exec spw-restore-test mysql -uroot -ptest spw_v2 -e \
  'SELECT COUNT(*) AS tenants FROM tenants; SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS props FROM properties;'

docker rm -f spw-restore-test
```

If the `mysql < dump.sql` step errors, **the backup is broken** — file an
incident and investigate before the next nightly overwrites history in your
retention window.

---

## Restore — real (production disaster recovery)

You are here because prod is either data-corrupted, wiped, or on a new host.
Follow top-to-bottom; do not skip verification steps.

### 1. Decide the recovery point

```bash
aws s3 ls s3://spw-backups-prod/mysql/ | sort | tail -20
```

Pick the latest dump that predates the incident. If data corruption started
Tuesday 14:00 UTC, restore Monday's nightly (03:15 UTC) — newer dumps may
have captured the corruption.

### 2. Stop writes to the current DB

Fast path: stop the API and any workers so nothing is writing while we
replace state.

```bash
ssh root@api.spw-ai.com
pm2 stop api
pm2 stop api-worker  # if split; omit if same process
```

Leave nginx up so `/api/health/live` can still be hit (it doesn't touch the
DB and will return 503 for `/ready` — that's expected).

### 3. Snapshot whatever is currently in the DB (in case it turns out to be recoverable)

```bash
mysqldump \
  --defaults-extra-file=/root/.my.cnf \
  --single-transaction --routines --triggers --events \
  --set-gtid-purged=OFF --default-character-set=utf8mb4 \
  spw_v2 | gzip -9 > /root/pre-restore-$(date -u +%Y-%m-%dT%H%M%S).sql.gz
```

Park this somewhere off-box too — `scp` it to your laptop or another S3 key.

### 4. Drop and recreate the DB, then restore

```bash
aws s3 cp s3://spw-backups-prod/mysql/YYYY-MM-DD.sql.gz /tmp/
gunzip /tmp/YYYY-MM-DD.sql.gz
mysql -u root -p -e 'DROP DATABASE spw_v2; CREATE DATABASE spw_v2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
mysql -u root -p spw_v2 < /tmp/YYYY-MM-DD.sql
```

### 5. Restore uploads if the disk was lost

Skip if the disk is intact.

```bash
aws s3 sync s3://spw-backups-prod/uploads/ \
  /var/www/vhosts/spw-ai.com/spw/apps/api/uploads/ \
  --delete
chown -R spw:spw /var/www/vhosts/spw-ai.com/spw/apps/api/uploads/
```

### 6. Clear Redis

Redis holds throttler counters and in-flight BullMQ jobs that refer to
the old DB's primary keys. Safer to flush than to reason about consistency.

```bash
redis-cli FLUSHDB
```

### 7. Start the API back up

```bash
pm2 start api
pm2 start api-worker
curl -fsS https://api.spw-ai.com/api/health/ready | jq
```

`status: "ok"` with DB+Redis green means you are live again.

### 8. Smoke test from an external box

```bash
# Login, list properties — catches 500s that /ready wouldn't
curl -fsS -X POST https://api.spw-ai.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin>","password":"<from password manager>"}'
```

### 9. Post-restore

- Post an incident note in ops chat: *which nightly was restored, what time
  window was lost, what followup (e.g. re-ingest from WP plugins for lost
  properties)*.
- If uploads were restored, users may see broken images for items created
  after the backup — flag this to support.
- Update `CHECKPOINT.md` with the new known-good state.

---

## Monitoring the backups themselves

Silent backup failures are the classic foot-gun. Two cheap checks:

1. **Cron-mail on failure** — `set -euo pipefail` in the script guarantees
   a non-zero exit on any problem; cron mails `root` by default. Verify mail
   works: `echo test | mail -s test root`.
2. **Recency alert** — a weekly cron on a *different* host calls
   `aws s3 ls s3://spw-backups-prod/mysql/ | tail -1` and alerts if the
   latest key is older than 36 hours. This catches the case where the API
   host is down and therefore not running its own backup.

Either failure mode is a page-worthy incident.

---

## Secrets & access

- S3 bucket `spw-backups-prod` is private and versioned. Only the API host's
  IAM role (`spw-backup-writer`) can write; the ops team has read access via
  SSO for restores.
- `/usr/local/bin/spw-backup.sh` runs as root and reads the API's
  `.env.production`. Keep both files at mode `0600` so a compromised
  unprivileged user can't leak DB creds.
- Rotate the S3 access keys (if using a user instead of an instance role)
  quarterly.
