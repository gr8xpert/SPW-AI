#!/bin/bash
# Test Resales-Online API directly from server with curl
# Verifies: file is updated, server IP is correct, raw API response
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/test-resales-api.sh

PROJECT="/var/www/vhosts/spw-ai.com/httpdocs/spw"
API="$PROJECT/apps/api"
DASH="$PROJECT/apps/dashboard"
OUT="/var/www/vhosts/spw-ai.com/httpdocs/test-resales-output.txt"

# Update these 3 values to your real credentials before running:
CLIENT_ID="1029727"
API_KEY="e1d35a171e1e10a6ffcb2aba490fe0678b720f51"
FILTER_ID="54031"

# Force unbuffered output AND write to file
{
echo "=== Resales API Test $(date) ==="
echo "Script PID: $$"
echo ""

echo "--- 1. Server outbound IP (must match Resales API key IP) ---"
echo "Expected: 77.68.115.185"
echo -n "Actual:   "
curl -s --max-time 10 https://ifconfig.me
echo ""
echo ""

echo "--- 2. Verify deployed adapter file ---"
ADAPTER="$API/src/modules/feed/adapters/resales.adapter.ts"
echo "File: $ADAPTER"
ls -la "$ADAPTER"
echo ""
echo "Check for new auth pattern:"
grep -n "p_agency_filterid: credentials.filterId" "$ADAPTER" && echo "[OK] new code present" || echo "[FAIL] OLD CODE still on disk"
grep -n "p1: credentials.clientId" "$ADAPTER" && echo "[OK] p1 fix present" || echo "[FAIL] p1 not fixed"
echo ""

echo "--- 3. Check compiled dist (what PM2 actually runs) ---"
DIST_ADAPTER="$API/dist/modules/feed/adapters/resales.adapter.js"
if [ -f "$DIST_ADAPTER" ]; then
  ls -la "$DIST_ADAPTER"
  grep -n "p_agency_filterid" "$DIST_ADAPTER" | head -3
  grep -c "P_PageNo" "$DIST_ADAPTER" && echo "[OK] P_PageNo in compiled output"
else
  echo "[FAIL] $DIST_ADAPTER does not exist — API was NOT rebuilt"
fi
echo ""

echo "--- 4. Raw curl test with V1's working pattern ---"
URL="https://webapi.resales-online.com/V6/SearchProperties"
echo "GET $URL"
echo "  p_agency_filterid=$FILTER_ID"
echo "  p1=$CLIENT_ID"
echo "  p2=$API_KEY"
echo "  P_PageNo=1, P_PageSize=1"
echo ""
echo "--- Response: ---"
curl -s --max-time 15 \
  --get \
  --data-urlencode "p_agency_filterid=$FILTER_ID" \
  --data-urlencode "p1=$CLIENT_ID" \
  --data-urlencode "p2=$API_KEY" \
  --data-urlencode "P_PageNo=1" \
  --data-urlencode "P_PageSize=1" \
  "$URL" | head -100
echo ""
echo ""

echo "--- 5. Try alternate param casing (some accounts need PascalCase) ---"
echo "--- Response: ---"
curl -s --max-time 15 \
  --get \
  --data-urlencode "P_Agency_FilterId=$FILTER_ID" \
  --data-urlencode "P1=$CLIENT_ID" \
  --data-urlencode "P2=$API_KEY" \
  --data-urlencode "P_PageNo=1" \
  --data-urlencode "P_PageSize=1" \
  "$URL" | head -100
echo ""
echo ""

echo "--- 6. PM2 status ---"
su - spw-ai.com_owyn3ig1vb -s /bin/bash -c "
  export NVM_DIR=\"/var/www/vhosts/spw-ai.com/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  pm2 status
  echo ''
  echo '--- spm-api recent logs ---'
  pm2 logs spm-api --nostream --lines 30
"

echo ""
echo "=== Done $(date) ==="
} > "$OUT" 2>&1

chmod 644 "$OUT"
echo "Output written to: $OUT"
ls -la "$OUT"
