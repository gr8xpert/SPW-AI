#!/bin/bash
# Test Resales with Filter ALIAS (1) instead of Filter ID (54031)
# Run: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/test-resales-alias.sh

OUT="/var/www/vhosts/spw-ai.com/httpdocs/test-resales-alias-output.txt"
CLIENT_ID="1029727"
API_KEY="e1d35a171e1e10a6ffcb2aba490fe0678b720f51"
URL="https://webapi.resales-online.com/V6/SearchProperties"

{
echo "=== Resales Alias Test $(date) ==="
echo ""

echo "--- A. p_agency_filterid=1 (FILTER ALIAS for Sale) ---"
curl -s --max-time 15 --get \
  --data-urlencode "p_agency_filterid=1" \
  --data-urlencode "p1=$CLIENT_ID" \
  --data-urlencode "p2=$API_KEY" \
  --data-urlencode "P_PageNo=1" \
  --data-urlencode "P_PageSize=1" \
  "$URL"
echo ""
echo ""

echo "--- B. p_agency_filterid=2 (FILTER ALIAS for STR) ---"
curl -s --max-time 15 --get \
  --data-urlencode "p_agency_filterid=2" \
  --data-urlencode "p1=$CLIENT_ID" \
  --data-urlencode "p2=$API_KEY" \
  --data-urlencode "P_PageNo=1" \
  --data-urlencode "P_PageSize=1" \
  "$URL"
echo ""
echo ""

echo "--- C. p_agency_filterid=$CLIENT_ID (using Client ID itself, with p_filterid=1) ---"
curl -s --max-time 15 --get \
  --data-urlencode "p_agency_filterid=$CLIENT_ID" \
  --data-urlencode "p_filterid=1" \
  --data-urlencode "p1=$CLIENT_ID" \
  --data-urlencode "p2=$API_KEY" \
  --data-urlencode "P_PageNo=1" \
  --data-urlencode "P_PageSize=1" \
  "$URL"
echo ""
echo ""

echo "--- D. Both: p_agency_filterid=$CLIENT_ID AND p_filterid=54031 ---"
curl -s --max-time 15 --get \
  --data-urlencode "p_agency_filterid=$CLIENT_ID" \
  --data-urlencode "p_filterid=54031" \
  --data-urlencode "p1=$CLIENT_ID" \
  --data-urlencode "p2=$API_KEY" \
  --data-urlencode "P_PageNo=1" \
  --data-urlencode "P_PageSize=1" \
  "$URL"
echo ""
echo ""

echo "=== Done ==="
} > "$OUT" 2>&1

chmod 644 "$OUT"
echo "Output: $OUT"
