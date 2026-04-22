#!/bin/bash
# Seed realistic test data for SPW v2 local testing
BASE_URL="http://localhost:3001"

login() {
  curl -s "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | \
    grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4
}

SA_TOKEN=$(login "admin@spw-ai.com" "AdminDkR8mNpZ4v!!")
T2_TOKEN=$(login "admin@costablancaprops.com" "SecurePass123!!")
T3_TOKEN=$(login "admin@marbellaluxury.es" "SecurePass123!!")
echo "Tokens acquired."

api() {
  local method=$1 path=$2 token=$3 data=$4
  if [ "$method" = "GET" ]; then
    curl -s "$BASE_URL$path" -H "Authorization: Bearer $token"
  else
    curl -s -X "$method" "$BASE_URL$path" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d "$data"
  fi
}

echo ""
echo "=== Locations (Costa Blanca) ==="
api POST "/api/dashboard/locations" "$T2_TOKEN" '{"name":{"en":"Costa Blanca"},"slug":"costa-blanca","level":"province"}'
echo ""
api POST "/api/dashboard/locations" "$T2_TOKEN" '{"name":{"en":"Torrevieja"},"slug":"torrevieja","level":"town"}'
echo ""
api POST "/api/dashboard/locations" "$T2_TOKEN" '{"name":{"en":"Orihuela Costa"},"slug":"orihuela-costa","level":"area"}'
echo ""
api POST "/api/dashboard/locations" "$T2_TOKEN" '{"name":{"en":"Alicante City"},"slug":"alicante-city","level":"municipality"}'
echo ""
api POST "/api/dashboard/locations" "$T2_TOKEN" '{"name":{"en":"Benidorm"},"slug":"benidorm","level":"town"}'
echo ""

echo "=== Features (Costa Blanca) ==="
api POST "/api/dashboard/features" "$T2_TOKEN" '{"name":{"en":"Swimming Pool"},"category":"exterior"}'
echo ""
api POST "/api/dashboard/features" "$T2_TOKEN" '{"name":{"en":"Garden"},"category":"exterior"}'
echo ""
api POST "/api/dashboard/features" "$T2_TOKEN" '{"name":{"en":"Garage"},"category":"parking"}'
echo ""
api POST "/api/dashboard/features" "$T2_TOKEN" '{"name":{"en":"Sea View"},"category":"views"}'
echo ""
api POST "/api/dashboard/features" "$T2_TOKEN" '{"name":{"en":"Air Conditioning"},"category":"climate"}'
echo ""
api POST "/api/dashboard/features" "$T2_TOKEN" '{"name":{"en":"Central Heating"},"category":"climate"}'
echo ""
api POST "/api/dashboard/features" "$T2_TOKEN" '{"name":{"en":"Terrace"},"category":"exterior"}'
echo ""
api POST "/api/dashboard/features" "$T2_TOKEN" '{"name":{"en":"Storage Room"},"category":"interior"}'
echo ""
api POST "/api/dashboard/features" "$T2_TOKEN" '{"name":{"en":"Communal Pool"},"category":"community"}'
echo ""
api POST "/api/dashboard/features" "$T2_TOKEN" '{"name":{"en":"Lift"},"category":"interior"}'
echo ""

echo "=== Contacts (Costa Blanca) ==="
api POST "/api/dashboard/contacts" "$T2_TOKEN" '{"email":"john.smith@gmail.com","name":"John Smith","phone":"+44 7700 900001","source":"inquiry","tags":["buyer","villa"]}'
echo ""
api POST "/api/dashboard/contacts" "$T2_TOKEN" '{"email":"emma.wilson@yahoo.co.uk","name":"Emma Wilson","phone":"+44 7700 900002","source":"newsletter","tags":["buyer","apartment"]}'
echo ""
api POST "/api/dashboard/contacts" "$T2_TOKEN" '{"email":"hans.mueller@web.de","name":"Hans Mueller","phone":"+49 170 1234567","source":"inquiry","tags":["buyer","new-build"]}'
echo ""
api POST "/api/dashboard/contacts" "$T2_TOKEN" '{"email":"sophie.dubois@orange.fr","name":"Sophie Dubois","phone":"+33 6 12 34 56 78","source":"manual","tags":["buyer","retirement"]}'
echo ""
api POST "/api/dashboard/contacts" "$T2_TOKEN" '{"email":"james.obrien@hotmail.com","name":"James O Brien","phone":"+353 87 123 4567","source":"inquiry","tags":["investor","multiple"]}'
echo ""

echo "=== Contacts (Marbella) ==="
api POST "/api/dashboard/contacts" "$T3_TOKEN" '{"email":"sarah.jones@gmail.com","name":"Sarah Jones","phone":"+44 7911 123456","source":"inquiry","tags":["luxury","villa"]}'
echo ""
api POST "/api/dashboard/contacts" "$T3_TOKEN" '{"email":"david.chen@outlook.com","name":"David Chen","phone":"+86 138 0013 8000","source":"manual","tags":["investor"]}'
echo ""

echo "=== Tickets (Costa Blanca) ==="
api POST "/api/dashboard/tickets" "$T2_TOKEN" '{"subject":"Widget not loading on our website","message":"The property search widget shows a blank white box on our homepage. We updated our WordPress theme yesterday and now it stopped working. URL: costablancaprops.com","priority":"high","category":"technical"}'
echo ""
api POST "/api/dashboard/tickets" "$T2_TOKEN" '{"subject":"Need to update company logo in widget","message":"We rebranded and need the logo in the widget header updated. Can you help?","priority":"low","category":"feature_request"}'
echo ""
api POST "/api/dashboard/tickets" "$T2_TOKEN" '{"subject":"Feed import showing duplicate properties","message":"Our Resales Online feed is creating duplicate entries. We have 3 copies of REF-1234 and 2 copies of REF-5678. Please help.","priority":"medium","category":"bug"}'
echo ""

echo "=== Tickets (Marbella) ==="
api POST "/api/dashboard/tickets" "$T3_TOKEN" '{"subject":"Cannot access billing page","message":"When I click on Billing in the dashboard, I get a 403 error. My subscription should be active.","priority":"high","category":"billing"}'
echo ""
api POST "/api/dashboard/tickets" "$T3_TOKEN" '{"subject":"Request for Spanish language support","message":"We need the widget to support Spanish language. Most of our buyers are English but we also serve Spanish clients.","priority":"medium","category":"feature_request"}'
echo ""

echo "=== Properties (Costa Blanca) ==="
api POST "/api/dashboard/properties" "$T2_TOKEN" '{"reference":"CB-001","title":{"en":"Stunning Sea View Villa in Torrevieja"},"description":{"en":"Beautiful 3 bedroom villa with panoramic sea views. Recently renovated with modern kitchen, private pool, and landscaped garden."},"price":285000,"currency":"EUR","status":"active","listingType":"sale","bedrooms":3,"bathrooms":2,"buildSize":145,"plotSize":400,"locationId":1,"propertyTypeId":1,"features":[1,2,4,5,7]}'
echo ""
api POST "/api/dashboard/properties" "$T2_TOKEN" '{"reference":"CB-002","title":{"en":"Modern Apartment in Orihuela Costa"},"description":{"en":"Bright 2 bedroom apartment in gated community with communal pool. South-facing terrace with golf views. Fully furnished."},"price":159000,"currency":"EUR","status":"active","listingType":"sale","bedrooms":2,"bathrooms":1,"buildSize":75,"locationId":2,"propertyTypeId":2,"features":[5,7,9]}'
echo ""
api POST "/api/dashboard/properties" "$T2_TOKEN" '{"reference":"CB-003","title":{"en":"Luxury Penthouse Alicante City Centre"},"description":{"en":"Exclusive penthouse with 360 degree views. Rooftop terrace with jacuzzi. Underground parking for 2 cars."},"price":495000,"currency":"EUR","status":"active","listingType":"sale","bedrooms":4,"bathrooms":3,"buildSize":210,"locationId":3,"propertyTypeId":4,"features":[4,5,6,7,10]}'
echo ""
api POST "/api/dashboard/properties" "$T2_TOKEN" '{"reference":"CB-004","title":{"en":"Cozy Bungalow near Benidorm"},"description":{"en":"Charming single level bungalow ideal for retirees. Private garden. Quiet residential area 10 min from Benidorm centre."},"price":175000,"currency":"EUR","status":"sold","listingType":"sale","bedrooms":2,"bathrooms":1,"buildSize":85,"plotSize":150,"locationId":4,"propertyTypeId":5,"features":[2,5,6]}'
echo ""
api POST "/api/dashboard/properties" "$T2_TOKEN" '{"reference":"CB-005","title":{"en":"Investment Townhouse Torrevieja Centre"},"description":{"en":"3 bedroom townhouse in town centre. Currently rented at 850 EUR/month. Good condition with patio and rooftop solarium."},"price":139000,"currency":"EUR","status":"active","listingType":"sale","bedrooms":3,"bathrooms":2,"buildSize":120,"plotSize":50,"locationId":1,"propertyTypeId":3,"features":[7,8]}'
echo ""
api POST "/api/dashboard/properties" "$T2_TOKEN" '{"reference":"CB-006","title":{"en":"New Build Villa with Private Pool"},"description":{"en":"Brand new key-ready villa in Orihuela Costa. Open plan living, modern design. Private pool and parking. 10 min to beach."},"price":349000,"currency":"EUR","status":"active","listingType":"sale","bedrooms":3,"bathrooms":2,"buildSize":130,"plotSize":300,"locationId":2,"propertyTypeId":1,"features":[1,2,3,5,7]}'
echo ""
api POST "/api/dashboard/properties" "$T2_TOKEN" '{"reference":"CB-007","title":{"en":"Beachfront Apartment Torrevieja"},"description":{"en":"Renovated 1 bed apartment directly on the beach promenade. Perfect holiday rental investment."},"price":119000,"currency":"EUR","status":"active","listingType":"sale","bedrooms":1,"bathrooms":1,"buildSize":55,"locationId":1,"propertyTypeId":2,"features":[4,5]}'
echo ""
api POST "/api/dashboard/properties" "$T2_TOKEN" '{"reference":"CB-R01","title":{"en":"Long Term Rental - 2 Bed Apartment Benidorm"},"description":{"en":"Fully furnished 2 bed apartment for long term rental. Close to beach and amenities. Available immediately."},"price":750,"currency":"EUR","status":"active","listingType":"rent","bedrooms":2,"bathrooms":1,"buildSize":70,"locationId":4,"propertyTypeId":2,"features":[5,9,10]}'
echo ""

echo "=== Credits ==="
api POST "/api/super-admin/credits/2/adjust" "$SA_TOKEN" '{"type":"adjustment","amount":500,"description":"Welcome bonus credits"}'
echo ""
api POST "/api/super-admin/credits/2/adjust" "$SA_TOKEN" '{"type":"adjustment","amount":-50,"description":"Feed import overage charge"}'
echo ""
api POST "/api/super-admin/credits/3/adjust" "$SA_TOKEN" '{"type":"adjustment","amount":1000,"description":"Annual subscription credit bundle"}'
echo ""
api POST "/api/super-admin/credits/5/adjust" "$SA_TOKEN" '{"type":"adjustment","amount":200,"description":"Promotional credit"}'
echo ""

echo "=== License Keys ==="
api POST "/api/super-admin/clients/2/license-keys" "$SA_TOKEN" '{"domain":"costablancaprops.com"}'
echo ""
api POST "/api/super-admin/clients/2/license-keys" "$SA_TOKEN" '{"domain":"staging.costablancaprops.com"}'
echo ""
api POST "/api/super-admin/clients/3/license-keys" "$SA_TOKEN" '{"domain":"marbellaluxury.es"}'
echo ""
api POST "/api/super-admin/clients/6/license-keys" "$SA_TOKEN" '{"domain":"malagasun.com"}'
echo ""

echo "=== Time entries (direct SQL - needs ticketId) ==="
# First get ticket IDs
TICKET_IDS=$(docker exec spw-mysql-1 mysql -u spw_app -p'local-app-password-2026' spw_v2_local -N -e "SELECT id FROM tickets ORDER BY id LIMIT 5;" 2>/dev/null)
if [ -n "$TICKET_IDS" ]; then
  FIRST_TICKET=$(echo "$TICKET_IDS" | head -1)
  docker exec spw-mysql-1 mysql -u spw_app -p'local-app-password-2026' spw_v2_local -e "
  INSERT INTO time_entries (ticketId, userId, hours, description, workDate, isPaid, createdAt) VALUES
  ($FIRST_TICKET, 2, 2.5, 'Widget installation and configuration', '2026-04-15', 0, '2026-04-15 10:00:00'),
  ($FIRST_TICKET, 2, 1.5, 'Custom CSS styling for property cards', '2026-04-16', 0, '2026-04-16 14:00:00'),
  ($FIRST_TICKET, 2, 3.0, 'Feed import troubleshooting', '2026-04-18', 0, '2026-04-18 09:00:00');
  " 2>/dev/null
  echo "Time entries added to ticket $FIRST_TICKET"
else
  echo "No tickets found, skipping time entries"
fi

echo ""
echo "=== Final counts ==="
docker exec spw-mysql-1 mysql -u spw_app -p'local-app-password-2026' spw_v2_local -e "
SELECT 'tenants' as tbl, COUNT(*) as cnt FROM tenants UNION ALL
SELECT 'users', COUNT(*) FROM users UNION ALL
SELECT 'properties', COUNT(*) FROM properties UNION ALL
SELECT 'contacts', COUNT(*) FROM contacts UNION ALL
SELECT 'locations', COUNT(*) FROM locations UNION ALL
SELECT 'property_types', COUNT(*) FROM property_types UNION ALL
SELECT 'features', COUNT(*) FROM features UNION ALL
SELECT 'tickets', COUNT(*) FROM tickets UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs UNION ALL
SELECT 'email_suppressions', COUNT(*) FROM email_suppressions UNION ALL
SELECT 'credit_transactions', COUNT(*) FROM credit_transactions UNION ALL
SELECT 'license_keys', COUNT(*) FROM license_keys UNION ALL
SELECT 'time_entries', COUNT(*) FROM time_entries UNION ALL
SELECT 'plans', COUNT(*) FROM plans;" 2>&1 | grep -v Warning
echo ""
echo "Done!"
