# SPW v2 — Backup & Restore Runbook

Covers MySQL nightly backups, R2/upload object backups, and the restore
procedure. Pair this with `DEPLOYMENT.md` for the surrounding deploy flow.

## Backup targets

| What | Where it lives | Loss impact |
|------|-----------------|-------------|
| MySQL `spw_v2` | Primary DB | All tenants, properties, leads, billing, webhooks — total |
| `apps/api/uploads/` (or R2 bucket) | Object store | Property images + dashboard uploads |
| `apps/api/.env` | Server filesystem only | ENCRYPTION_KEY loss = all AES-GCM rows unreadable |

> **Warning:** losing the `ENCRYPTION_KEY` cannot be recovered from a DB
> backup alone — every `enc:v1:` row (`tenants.webhookSecret`,
> `tenants.openrouterApiKey`, `tenants.recaptchaSecretKey`,
> `feed_configs.credentials`, `tenant_email_configs.smtpPassword`) becomes
> permanently unreadable. Back up the key alongside the DB dump and store
> them in different physical locations.

## Nightly MySQL backup

Add to crontab on the API host (runs at 02:30 UTC daily):

```bash
30 2 * * * /var/www/vhosts/spw-ai.com/spw/scripts/backup-mysql.sh
```

`scripts/backup-mysql.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/spw
RETENTION_DAYS=14
TS=$(date +%Y%m%d-%H%M)
mkdir -p "$BACKUP_DIR"

# Use --single-transaction so the dump is consistent without locking write
# traffic. utf8mb4 + default-character-set match the schema.
mysqldump \
  --single-transaction \
  --default-character-set=utf8mb4 \
  --routines --triggers --events \
  --user="$DB_USER" --password="$DB_PASSWORD" \
  spw_v2 | gzip -9 > "$BACKUP_DIR/spw_v2-$TS.sql.gz"

# Encrypt with the operator's GPG key before shipping offsite.
gpg --encrypt --recipient ops@spw-ai.com \
  --output "$BACKUP_DIR/spw_v2-$TS.sql.gz.gpg" \
  "$BACKUP_DIR/spw_v2-$TS.sql.gz"
rm "$BACKUP_DIR/spw_v2-$TS.sql.gz"

# Ship to S3/R2/Backblaze.
aws s3 cp "$BACKUP_DIR/spw_v2-$TS.sql.gz.gpg" \
  "s3://spw-backups/mysql/" --storage-class STANDARD_IA

# Local retention.
find "$BACKUP_DIR" -name 'spw_v2-*.sql.gz.gpg' -mtime +$RETENTION_DAYS -delete
```

Required env vars in the cron script's environment (or use `~/.my.cnf`):
`DB_USER`, `DB_PASSWORD`, plus AWS creds for the S3 upload.

## Object storage backup

If feed images live on Cloudflare R2 (`feedImagesToR2 = true`), enable
R2 bucket versioning + lifecycle rules — there's no need to dump the
bucket. For the on-disk `apps/api/uploads/` path, mirror nightly:

```bash
45 2 * * * rsync -a --delete \
  /var/www/vhosts/spw-ai.com/spw/apps/api/uploads/ \
  /var/backups/spw/uploads/
```

## Restore — full disaster recovery

Assume new host, empty DB, latest backup tarball downloaded.

1. **Restore secrets first.** Place the operator's saved `.env` files at
   `apps/api/.env` and `apps/dashboard/.env.local`. Verify
   `ENCRYPTION_KEY` matches the one in use when the backup was taken —
   otherwise every encrypted column will decrypt to garbage.

2. **Decrypt + restore MySQL dump.**

   ```bash
   gpg --decrypt spw_v2-YYYYMMDD-HHMM.sql.gz.gpg | gunzip | \
     mysql -u root -p
   ```

3. **Restore uploads** (if not on R2):

   ```bash
   rsync -a /var/backups/spw/uploads/ \
     /var/www/vhosts/spw-ai.com/spw/apps/api/uploads/
   ```

4. **Verify migrations are current.** A backup from an older deploy
   won't include rows for newer migrations, but the migration table will:

   ```bash
   cd apps/api && pnpm migration:run
   ```

5. **Start services.**

   ```bash
   pm2 start ecosystem.config.js --env production
   pm2 logs api --lines 100  # boot audit should pass
   ```

6. **Smoke checks.**
   - `GET /api/health` → `{status: ok, checks: {database: ok, redis: ok}}`
   - Login to dashboard with a known account.
   - Public widget request: `GET /api/v1/sync-meta` with a tenant API key.

## Restore — partial / point-in-time

If you only need to roll back a specific tenant's properties:

```sql
START TRANSACTION;
-- See what's there
SELECT id, reference, status FROM properties WHERE tenantId = 42;
-- Then DELETE / re-INSERT from a parallel dump of just that tenant.
COMMIT;
```

Per-tenant dump from a full backup:

```bash
gpg --decrypt spw_v2-YYYYMMDD-HHMM.sql.gz.gpg | gunzip | \
  awk '/INSERT INTO `properties`/ && /tenantId/ && / 42, /' > tenant42.sql
```

## Quarterly restore drill

Required to catch silent corruption / encryption-key drift before a real
incident. Schedule:

- **Q1, Q2, Q3, Q4** — first Monday of the quarter, ops team picks the
  most recent monthly backup, restores into a sandbox VM, runs the smoke
  checks, then tears it down.
- File the result (pass/fail + recovery time) in the ops log so trends
  are visible across drills.

## Encryption key rotation (advanced)

`ENCRYPTION_KEY` rotation requires re-encrypting every `enc:v1:` row.
Do it inside a maintenance window:

1. Set both `ENCRYPTION_KEY_OLD` and `ENCRYPTION_KEY` (new) in `.env`.
2. Run a one-shot migration that decrypts each `enc:v1:` row with the
   old key and re-encrypts with the new key. (Pattern: see
   `SecretEncryptionWidening` migration's `encryptColumn()` helper.)
3. Remove `ENCRYPTION_KEY_OLD`. Restart API.
4. Take a fresh full backup so the next restore uses the new key.
