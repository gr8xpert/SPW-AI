#!/bin/bash
# Full API deploy: 9134c89 changes + i18n interceptor fix.
# Run as root after uploading api-full-deploy.tar.gz to /var/www/vhosts/spw-ai.com/httpdocs/spw/
#
# Steps: backup → extract → install deps → build → migrate → restart → health check.
#
# If anything fails before the API restart, the previous dist/ is still running.
# If migrations fail, the new dist/ is built but old dist/ is still running — restore
# from backup tar if needed.

set -uo pipefail

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
HOME_DIR="/var/www/vhosts/spw-ai.com"
SITE_USER="spw-ai.com_owyn3ig1vb"
API="$PROJECT/apps/api"
TAR="$PROJECT/api-full-deploy.tar.gz"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/deploy-api-9134c89-output.txt"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="/tmp/api-src-backup-$STAMP.tar.gz"

exec > "$OUT" 2>&1

echo "=== Full API deploy $(date) ==="
echo "  tarball: $TAR"
echo "  backup:  $BACKUP"
echo

test -r "$TAR" || { echo "FATAL: tarball $TAR missing — upload first"; exit 1; }

echo "--- 1. Backup current API src ---"
tar -czf "$BACKUP" -C "$PROJECT" apps/api/src apps/api/package.json pnpm-lock.yaml 2>&1 | tail -3
echo "  backup size: $(du -h "$BACKUP" | cut -f1)"
echo

echo "--- 2. Stop API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 stop spm-api 2>&1 | tail -5
"
echo

echo "--- 3. Extract new source ---"
cd "$PROJECT"
tar -xzvf "$TAR" 2>&1 | tail -10
chown -R "$SITE_USER:psacln" "$API/src" "$API/package.json" "$PROJECT/pnpm-lock.yaml"
echo

echo "--- 4. Install deps (pnpm) ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm install --filter api 2>&1 | tail -20
"
INSTALL_EXIT=$?
echo "pnpm install exit: $INSTALL_EXIT"
if [ $INSTALL_EXIT -ne 0 ]; then echo "[FAIL] pnpm install failed."; exit 1; fi
echo

echo "--- 5. Build API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $PROJECT
  pnpm --filter api build 2>&1
"
BUILD_EXIT=$?
echo "build exit: $BUILD_EXIT"
if [ $BUILD_EXIT -ne 0 ]; then
  echo "[FAIL] Build failed — old dist/ still running. Restore: tar -xzf $BACKUP -C $PROJECT"
  exit 1
fi
echo

echo "--- 6. Run migrations ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  cd $API
  pnpm db:migrate 2>&1
"
MIG_EXIT=$?
echo "migration exit: $MIG_EXIT"
if [ $MIG_EXIT -ne 0 ]; then
  echo "[WARN] Migration failed. New dist/ exists but DB schema may be inconsistent."
  echo "       Investigate before restart. Restore: tar -xzf $BACKUP -C $PROJECT"
  exit 1
fi
echo

echo "--- 7. Restart API ---"
su - "$SITE_USER" -s /bin/bash -c "
  export NVM_DIR=\"$HOME_DIR/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 restart spm-api 2>&1 | tail -10
  sleep 8
  pm2 status spm-api 2>&1 | tail -10
"
echo

echo "--- 8. Health check ---"
sleep 2
for path in /api/health /api/v1/property-types; do
  code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "http://127.0.0.1:3001$path" || echo 000)
  printf '  GET %-30s %s\n' "$path" "$code"
done
echo
echo "=== Done $(date) ==="
chmod 644 "$OUT"
