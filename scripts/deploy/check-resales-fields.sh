#!/bin/bash
# Check if SearchProperties returns financial fields, or if we need PropertyDetails per property
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/check-resales-fields.sh

OUT="/var/www/vhosts/spw-ai.com/httpdocs/check-resales-fields-output.txt"
CLIENT_ID="1029727"
API_KEY="e1d35a171e1e10a6ffcb2aba490fe0678b720f51"
FILTER_ALIAS="1"

{
echo "=== Check Resales Field Coverage $(date) ==="
echo ""

echo "--- 1. SearchProperties list — first property full JSON ---"
LIST=$(curl -s --max-time 15 --get \
  --data-urlencode "p_agency_filterid=$FILTER_ALIAS" \
  --data-urlencode "p1=$CLIENT_ID" \
  --data-urlencode "p2=$API_KEY" \
  --data-urlencode "P_PageNo=1" \
  --data-urlencode "P_PageSize=1" \
  "https://webapi.resales-online.com/V6/SearchProperties")
echo "$LIST" | python3 -c "import json,sys; d=json.load(sys.stdin); p=d.get('Property',[{}])[0] if isinstance(d.get('Property'),list) else d.get('Property',{}); print('Property keys:'); [print(' ', k) for k in sorted(p.keys())]; print(''); print('Financial-related values:'); [print(f'  {k}: {p.get(k,\"NOT IN RESPONSE\")}') for k in ['CommunityFees','IBI','Basura','BuiltYear','EnergyRated','CO2Rated','OriginalPrice']]"

REF=$(echo "$LIST" | python3 -c "import json,sys; d=json.load(sys.stdin); p=d.get('Property',[{}])[0] if isinstance(d.get('Property'),list) else d.get('Property',{}); print(p.get('Reference',''))")
echo ""
echo "Picked Reference: $REF"

echo ""
echo "--- 2. PropertyDetails for same reference — full JSON ---"
DETAIL=$(curl -s --max-time 15 --get \
  --data-urlencode "p_agency_filterid=$FILTER_ALIAS" \
  --data-urlencode "p1=$CLIENT_ID" \
  --data-urlencode "p2=$API_KEY" \
  --data-urlencode "P_RefId=$REF" \
  --data-urlencode "P_Lang=EN" \
  --data-urlencode "P_Dimension=1" \
  "https://webapi.resales-online.com/V6/PropertyDetails")
echo "$DETAIL" | python3 -c "import json,sys; d=json.load(sys.stdin); p=d.get('Property',{}) if not isinstance(d.get('Property'),list) else d.get('Property',[{}])[0]; print('Property keys (detail):'); [print(' ', k) for k in sorted(p.keys())]; print(''); print('Financial-related values:'); [print(f'  {k}: {p.get(k,\"NOT IN RESPONSE\")}') for k in ['CommunityFees','IBI','Basura','BuiltYear','EnergyRated','CO2Rated','OriginalPrice']]"

echo ""
echo "=== Done $(date) ==="
} > "$OUT" 2>&1

chmod 644 "$OUT"
echo "Output: $OUT"
