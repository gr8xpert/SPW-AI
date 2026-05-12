#!/bin/bash
# One-shot deploy: extract uploaded tarball + rebuild API + run migrations + rebuild dashboard.
# Upload to:  /var/www/vhosts/spw-ai.com/httpdocs/deploy/
# Run as root: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/deploy-all-2026-05-12.sh

set -e

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
DEPLOY_DIR="$PROJECT/deploy"
TARBALL="$PROJECT/upload.tar.gz"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/deploy-all-output.txt"

{
  echo "=== Deploy All — $(date) ==="
  echo ""

  cd "$PROJECT"
  if [ -f "$TARBALL" ]; then
    echo "--- 1. Extracting tarball (overwriting existing files) ---"
    tar --overwrite -xzvf "$TARBALL"
    echo ""
  else
    echo "--- 1. Skipping extract (tarball already removed) ---"
    echo ""
  fi

  echo "--- 2. Rebuilding API ---"
  bash "$DEPLOY_DIR/rebuild-api.sh"
  echo ""

  echo "--- 3. Running migrations ---"
  bash "$DEPLOY_DIR/run-migrations.sh"
  echo ""

  echo "--- 4. Rebuilding dashboard ---"
  bash "$DEPLOY_DIR/force-rebuild-dashboard.sh"
  echo ""

  echo "--- 5. Cleanup tarball ---"
  rm -f "$TARBALL"
  echo "Removed $TARBALL"
  echo ""

  echo "=== Done — $(date) ==="
} > "$OUT" 2>&1

chmod 644 "$OUT"
echo "Output: $OUT"
