#!/usr/bin/env bash
# Install cron-parser@4.9.0 (+ its luxon@3.7.2 dep) into apps/api/node_modules.
# Bypasses pnpm/npm entirely — neither is in root's PATH and the workspace
# pnpm store is locked to root with 700 perms, so we can't run pnpm as the
# app user either. Instead we just curl the tarballs from the npm registry
# and extract them into the workspace's node_modules folder. Zero ambient
# tools needed beyond curl + tar (both standard on Plesk hosts).
#
# Usage:  bash /var/www/vhosts/spw-ai.com/httpdocs/spw/deploy/install-cron-parser.sh

set -uo pipefail

API_DIR="${API_DIR:-/var/www/vhosts/spw-ai.com/httpdocs/spw/apps/api}"
APP_USER="${APP_USER:-spw-ai.com_owyn3ig1vb}"
NVM_DIR_PATH="${NVM_DIR_PATH:-/var/www/vhosts/spw-ai.com/.nvm}"
OUT_FILE="${OUT_FILE:-/var/www/vhosts/spw-ai.com/httpdocs/install-cron-output.txt}"
NM_DIR="$API_DIR/node_modules"

mkdir -p "$(dirname "$OUT_FILE")" 2>/dev/null || true
exec > >(tee "$OUT_FILE") 2>&1

echo "=== install-cron-parser.sh @ $(date) ==="
echo "  API_DIR=$API_DIR"
echo "  NM_DIR=$NM_DIR"
echo "  OUT_FILE=$OUT_FILE"
echo

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found — cannot fetch tarballs."
  exit 1
fi
if [ ! -d "$NM_DIR" ]; then
  echo "node_modules not found at $NM_DIR — workspace not installed?"
  exit 1
fi

# Each entry: <package> <version> <registry-path>
install_tarball() {
  local pkg="$1"
  local ver="$2"
  local base="${pkg##*/}"           # 'cron-parser' from '@scope/cron-parser'
  local url="https://registry.npmjs.org/$pkg/-/$base-$ver.tgz"
  local target="$NM_DIR/$pkg"
  local tmp
  tmp="$(mktemp -d)"

  echo "  $pkg@$ver"
  echo "    url:    $url"
  echo "    target: $target"

  if ! curl -sfL "$url" -o "$tmp/pkg.tgz"; then
    echo "    FAIL: download error"
    rm -rf "$tmp"
    return 1
  fi

  # Wipe any existing folder so we don't end up with mixed files
  rm -rf "$target"
  mkdir -p "$target"

  # The tarball entries are prefixed with 'package/' — strip that prefix.
  if ! tar -xzf "$tmp/pkg.tgz" -C "$target" --strip-components=1; then
    echo "    FAIL: extract error"
    rm -rf "$tmp"
    return 1
  fi

  rm -rf "$tmp"

  # Make sure the app user can read everything.
  chmod -R a+rX "$target"
  if id -u "$APP_USER" >/dev/null 2>&1; then
    chown -R "$APP_USER":"$APP_USER" "$target" 2>/dev/null || true
  fi

  echo "    OK"
}

echo "=== 1/2 Installing tarballs ==="
install_tarball cron-parser 4.9.0 || exit 1
install_tarball luxon 3.7.2       || exit 1

echo
echo "=== 2/2 Verifying require.resolve() as $APP_USER ==="
su - "$APP_USER" -s /bin/bash -c "
  export NVM_DIR=$NVM_DIR_PATH
  . \$NVM_DIR/nvm.sh
  cd $API_DIR
  node -e \"
    console.log('cron-parser ->', require.resolve('cron-parser'));
    console.log('luxon       ->', require.resolve('luxon'));
    const cp = require('cron-parser');
    console.log('parseExpression typeof:', typeof cp.parseExpression);
  \"
"
rc=$?

echo
if [ "$rc" = "0" ]; then
  echo "Done. Now run ./v.sh to restart PM2 and verify the API."
else
  echo "Modules unpacked but did not resolve. Check above."
  exit "$rc"
fi
