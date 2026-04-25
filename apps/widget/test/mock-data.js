// Shared mock data for all test pages
// This simulates what the DataLoader would provide from the bundle.json

const MOCK_LOCATIONS = [
  { id: 1, name: 'Spain', slug: 'spain', level: 'country', propertyCount: 350 },
  { id: 2, name: 'Andalucía', slug: 'andalucia', level: 'province', parentId: 1, propertyCount: 280 },
  { id: 3, name: 'Málaga', slug: 'malaga', level: 'municipality', parentId: 2, propertyCount: 200, lat: 36.72, lng: -4.42 },
  { id: 4, name: 'Marbella', slug: 'marbella', level: 'town', parentId: 3, propertyCount: 120, lat: 36.51, lng: -4.88 },
  { id: 5, name: 'Estepona', slug: 'estepona', level: 'town', parentId: 3, propertyCount: 60, lat: 36.43, lng: -5.15 },
  { id: 6, name: 'Benahavís', slug: 'benahavis', level: 'town', parentId: 3, propertyCount: 35, lat: 36.52, lng: -5.05 },
  { id: 7, name: 'Golden Mile', slug: 'golden-mile', level: 'area', parentId: 4, propertyCount: 45, lat: 36.51, lng: -4.90 },
  { id: 8, name: 'Nueva Andalucía', slug: 'nueva-andalucia', level: 'area', parentId: 4, propertyCount: 38, lat: 36.50, lng: -4.94 },
  { id: 9, name: 'San Pedro', slug: 'san-pedro', level: 'area', parentId: 4, propertyCount: 22, lat: 36.49, lng: -4.99 },
  { id: 10, name: 'Costa del Sol', slug: 'costa-del-sol', level: 'province', parentId: 1, propertyCount: 180, lat: 36.72, lng: -4.42 },
];

const MOCK_TYPES = [
  { id: 1, name: 'Apartment', slug: 'apartment', icon: '🏢' },
  { id: 2, name: 'Villa', slug: 'villa', icon: '🏡' },
  { id: 3, name: 'Townhouse', slug: 'townhouse', icon: '🏘️' },
  { id: 4, name: 'Penthouse', slug: 'penthouse', icon: '🏙️' },
  { id: 5, name: 'Land', slug: 'land', icon: '🌳' },
  { id: 6, name: 'Commercial', slug: 'commercial', icon: '🏪' },
  { id: 7, name: 'Country House', slug: 'country-house', icon: '🏚️' },
];

const MOCK_FEATURES = [
  { id: 1, name: 'Swimming Pool', category: 'Exterior' },
  { id: 2, name: 'Garden', category: 'Exterior' },
  { id: 3, name: 'Terrace', category: 'Exterior' },
  { id: 4, name: 'Sea Views', category: 'Views' },
  { id: 5, name: 'Mountain Views', category: 'Views' },
  { id: 6, name: 'Golf Views', category: 'Views' },
  { id: 7, name: 'Air Conditioning', category: 'Interior' },
  { id: 8, name: 'Underfloor Heating', category: 'Interior' },
  { id: 9, name: 'Fireplace', category: 'Interior' },
  { id: 10, name: 'Fitted Kitchen', category: 'Interior' },
  { id: 11, name: 'Garage', category: 'Parking' },
  { id: 12, name: 'Covered Parking', category: 'Parking' },
  { id: 13, name: 'Gym', category: 'Community' },
  { id: 14, name: 'Sauna', category: 'Community' },
  { id: 15, name: 'Concierge', category: 'Community' },
  { id: 16, name: 'Gated Community', category: 'Community' },
  { id: 17, name: 'Beachfront', category: 'Location' },
  { id: 18, name: 'Close to Golf', category: 'Location' },
  { id: 19, name: 'Close to Schools', category: 'Location' },
  { id: 20, name: 'Close to Shops', category: 'Location' },
];

const MOCK_LABELS = {
  location: 'Location',
  listing_type: 'Listing Type',
  property_type: 'Property Type',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  price: 'Price',
  min_price: 'Min Price',
  max_price: 'Max Price',
  built_area: 'Built Area',
  plot_size: 'Plot Size',
  features: 'Features',
  reference: 'Reference',
  search: 'Search',
  reset: 'Reset Filters',
  sale: 'For Sale',
  rent: 'For Rent',
  holiday_rent: 'Holiday Rental',
  development: 'New Development',
  all: 'All',
  any: 'Any',
  select: 'Select...',
  min: 'Min',
  max: 'Max',
  beds: 'beds',
  baths: 'baths',
  results_count: '{from}-{to} of {total} properties',
  no_results: 'No properties found matching your criteria.',
  sort_by: 'Sort by',
  sort_featured: 'Featured',
  sort_price_asc: 'Price: Low to High',
  sort_price_desc: 'Price: High to Low',
  sort_date_desc: 'Newest First',
  sort_date_asc: 'Oldest First',
  clear_all: 'Clear All',
  active_filters: 'Active Filters',
  view_grid: 'Grid View',
  view_list: 'List View',
  loading: 'Loading...',
  price_on_request: 'Price on Request',
  featured: 'Featured',
  previous: 'Previous',
  next: 'Next',
  page: 'Page',
  close: 'Close',
  gallery: 'Gallery',
  description: 'Description',
  specifications: 'Specifications',
  property_features: 'Features',
  similar_properties: 'Similar Properties',
  contact_agent: 'Contact Agent',
  send_inquiry: 'Send Inquiry',
  your_name: 'Your Name',
  your_email: 'Your Email',
  your_phone: 'Your Phone',
  your_message: 'Your Message',
  inquiry_success: 'Thank you! Your inquiry has been sent.',
  inquiry_error: 'Failed to send inquiry. Please try again.',
  share: 'Share',
  add_to_wishlist: 'Add to Wishlist',
  remove_from_wishlist: 'Remove from Wishlist',
  back_to_results: 'Back to Results',
  mortgage_calculator: 'Mortgage Calculator',
  property_price: 'Property Price',
  down_payment: 'Down Payment',
  interest_rate: 'Interest Rate',
  loan_term: 'Loan Term',
  monthly_payment: 'Monthly Payment',
  years: 'years',
  map_unavailable: 'Map could not be loaded',
  chat_title: 'Property Assistant',
  chat_toggle: 'Chat with AI',
  chat_welcome: 'Ask me anything about our properties!',
  chat_placeholder: 'Type your question...',
  chat_error: 'Sorry, something went wrong. Please try again.',
  wishlist: 'Wishlist',
  wishlist_empty: 'Your wishlist is empty',
  wishlist_empty_desc: 'Save properties you like to compare them later.',
  browse_properties: 'Browse Properties',
  compare: 'Compare',
  clear_wishlist: 'Clear Wishlist',
  share_wishlist: 'Share Wishlist',
  shared_wishlist_banner: 'You are viewing a shared wishlist.',
  save_to_my_wishlist: 'Save to My Wishlist',
  advanced_search: 'Advanced Search',
  quick_features: 'Quick Features',
  search_address: 'Search by address...',
  radius: 'Radius',
  map_view: 'Map View',
  list_view: 'List View',
  zones: 'Zones',
  properties: 'Properties',
  view_all: 'View All',
  language: 'Language',
  currency: 'Currency',
};

function generateMockImage(id, seed) {
  return {
    id: id,
    url: `https://picsum.photos/seed/prop${seed}/800/600`,
    thumbnailUrl: `https://picsum.photos/seed/prop${seed}/400/300`,
    alt: `Property ${seed}`,
    order: 0,
  };
}

function generateMockProperty(id) {
  const types = MOCK_TYPES;
  const locations = [MOCK_LOCATIONS[3], MOCK_LOCATIONS[4], MOCK_LOCATIONS[5], MOCK_LOCATIONS[6], MOCK_LOCATIONS[7], MOCK_LOCATIONS[8]];
  const listingTypes = ['sale', 'sale', 'sale', 'rent', 'sale', 'holiday_rent'];
  const titles = [
    'Luxury Beachfront Villa', 'Modern Apartment with Sea Views', 'Spacious Penthouse',
    'Charming Townhouse', 'Contemporary Villa', 'Elegant Garden Apartment',
    'Mountain View Retreat', 'Golf Course Penthouse', 'Renovated Duplex',
    'New Build Apartment', 'Family Villa with Pool', 'Boutique Studio',
    'Grand Mediterranean Estate', 'Cozy Country House', 'Stylish Loft Apartment',
    'Exclusive Frontline Beach', 'Private Hilltop Villa', 'Designer Apartment',
  ];

  const type = types[id % types.length];
  const location = locations[id % locations.length];
  const prices = [250000, 385000, 450000, 1200000, 550000, 720000, 195000, 890000, 325000, 1500000, 650000, 175000, 2100000, 410000, 280000, 3500000, 980000, 365000];
  const price = prices[id % prices.length];
  const beds = [1, 2, 3, 4, 3, 5, 2, 3, 4, 2, 5, 1, 6, 3, 2, 7, 4, 2];
  const baths = [1, 2, 2, 3, 2, 4, 1, 2, 3, 2, 3, 1, 5, 2, 1, 6, 3, 2];
  const buildSizes = [85, 120, 180, 350, 200, 280, 65, 150, 140, 95, 400, 45, 600, 160, 90, 800, 300, 110];
  const plotSizes = [0, 0, 0, 1200, 800, 0, 0, 0, 0, 0, 1500, 0, 3000, 2000, 0, 5000, 1800, 0];

  // 3-tier geo: tier 1 (exact lat/lng), tier 2 (zip only), tier 3 (location fallback)
  var zipCodes = ['29602', '29680', '29679', '29660', '29670', '29688'];
  var tier = (id % 3);  // 0=tier1, 1=tier2, 2=tier3
  var jitterLat = ((id * 7 + 3) % 10) * 0.002;
  var jitterLng = ((id * 13 + 7) % 11 - 5) * 0.002;
  var baseLat = location.lat + 0.005 + jitterLat;
  var baseLng = location.lng + jitterLng;
  var propZipCode = zipCodes[id % zipCodes.length];

  const numImages = 3 + (id % 4);
  const images = [];
  for (let i = 0; i < numImages; i++) {
    images.push(generateMockImage(id * 10 + i, id * 10 + i));
  }

  const allFeatures = MOCK_FEATURES;
  const propFeatures = [];
  for (let i = 0; i < 5 + (id % 6); i++) {
    propFeatures.push(allFeatures[(id + i * 3) % allFeatures.length]);
  }

  return {
    id: id,
    reference: `SPW-${String(1000 + id).padStart(5, '0')}`,
    title: titles[id % titles.length],
    description: `Beautiful ${type.name.toLowerCase()} located in ${location.name}. This stunning property offers ${beds[id % beds.length]} bedrooms and ${baths[id % baths.length]} bathrooms with ${buildSizes[id % buildSizes.length]}m² of living space. Enjoy the Mediterranean lifestyle with high-quality finishes throughout. Close to amenities, beaches, and golf courses.`,
    shortDescription: `${beds[id % beds.length]} bed ${type.name.toLowerCase()} in ${location.name}`,
    listingType: listingTypes[id % listingTypes.length],
    propertyType: type,
    location: location,
    price: price,
    priceOnRequest: id === 12,
    currency: 'EUR',
    bedrooms: beds[id % beds.length],
    bathrooms: baths[id % baths.length],
    buildSize: buildSizes[id % buildSizes.length],
    plotSize: plotSizes[id % plotSizes.length] || undefined,
    terraceSize: id % 3 === 0 ? 25 + id : undefined,
    gardenSize: plotSizes[id % plotSizes.length] > 0 ? Math.floor(plotSizes[id % plotSizes.length] * 0.4) : undefined,
    year: 2015 + (id % 10),
    orientation: ['South', 'South-West', 'South-East', 'West', 'East'][id % 5],
    energyRating: ['A', 'B', 'C', 'D', 'E'][id % 5],
    parking: id % 3 === 0 ? 'Garage' : id % 3 === 1 ? 'Underground' : undefined,
    status: id % 7 === 0 ? 'Under Offer' : undefined,
    images: images,
    features: propFeatures,
    isFeatured: id % 4 === 0,
    zipCode: tier <= 1 ? propZipCode : undefined,
    lat: tier === 0 ? baseLat : undefined,
    lng: tier === 0 ? baseLng : undefined,
    agent: {
      name: ['Maria García', 'James Smith', 'Carlos López', 'Sarah Johnson'][id % 4],
      email: 'agent@realtysoft.eu',
      phone: '+34 612 345 678',
      photo: `https://i.pravatar.cc/150?u=agent${id % 4}`,
      title: 'Property Consultant',
    },
    createdAt: new Date(2025, 0, 1 + id).toISOString(),
    updatedAt: new Date(2026, 3, 1 + (id % 25)).toISOString(),
  };
}

// Generate 300 mock properties for realistic explore-mode map clustering
const MOCK_PROPERTIES = [];
for (let i = 0; i < 300; i++) {
  MOCK_PROPERTIES.push(generateMockProperty(i));
}

// Set up window.__SPW_DATA__ (Layer 0 preload)
window.__SPW_DATA__ = {
  syncVersion: 1,
  config: {
    enableFavorites: true,
    enableInquiry: true,
    enableAiChat: true,
    enableMortgageCalculator: true,
    mapSearchEnabled: true,
    similarProperties: true,
    quickFeatureIds: [1, 4, 17, 18],
    primaryColor: '#2563eb',
    companyName: 'Costa del Sol Luxury Estates',
  },
  locations: MOCK_LOCATIONS,
  types: MOCK_TYPES,
  features: MOCK_FEATURES,
  labels: MOCK_LABELS,
  defaultResults: {
    data: MOCK_PROPERTIES.slice(0, 12),
    meta: {
      total: MOCK_PROPERTIES.length,
      page: 1,
      limit: 12,
      pages: Math.ceil(MOCK_PROPERTIES.length / 12),
    },
  },
};

// Make data available globally for test pages
window.__MOCK_PROPERTIES = MOCK_PROPERTIES;
window.__MOCK_LOCATIONS = MOCK_LOCATIONS;
window.__MOCK_TYPES = MOCK_TYPES;
window.__MOCK_FEATURES = MOCK_FEATURES;

// ========================================================
// Fetch interceptor — returns mock data when backend is not running.
// If the real API is reachable, requests pass through normally.
// ========================================================
(function() {
  var realFetch = window.fetch;

  function filterProperties(params) {
    var results = MOCK_PROPERTIES.slice();

    if (params.listingType) {
      results = results.filter(function(p) { return p.listingType === params.listingType; });
    }
    if (params.locationId) {
      var locId = Number(params.locationId);
      results = results.filter(function(p) { return p.location && p.location.id === locId; });
    }
    if (params.propertyTypeId) {
      var ptId = Number(params.propertyTypeId);
      results = results.filter(function(p) { return p.propertyType && p.propertyType.id === ptId; });
    }
    if (params.minPrice) {
      results = results.filter(function(p) { return p.price >= Number(params.minPrice); });
    }
    if (params.maxPrice) {
      results = results.filter(function(p) { return p.price <= Number(params.maxPrice); });
    }
    if (params.minBedrooms) {
      results = results.filter(function(p) { return p.bedrooms >= Number(params.minBedrooms); });
    }

    if (params.sortBy === 'price_asc') results.sort(function(a, b) { return a.price - b.price; });
    else if (params.sortBy === 'price_desc') results.sort(function(a, b) { return b.price - a.price; });

    var page = Number(params.page) || 1;
    var limit = Number(params.limit) || 12;
    var start = (page - 1) * limit;
    var paged = results.slice(start, start + limit);

    return {
      data: paged,
      meta: { total: results.length, page: page, limit: limit, pages: Math.ceil(results.length / limit) || 1 }
    };
  }

  function mockResponse(body) {
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  }

  window.fetch = function(input, init) {
    var url;
    try { url = new URL(typeof input === 'string' ? input : input.url, location.origin); } catch(e) { return realFetch(input, init); }
    var path = url.pathname;

    // Search / list properties
    if (path.match(/\/api\/v1\/properties$/) && (!init || init.method === 'GET' || !init.method)) {
      var params = {};
      url.searchParams.forEach(function(v, k) { params[k] = v; });
      console.log('[Mock] Intercepted search:', params);
      return mockResponse({ data: filterProperties(params) });
    }

    // Single property detail
    var detailMatch = path.match(/\/api\/v1\/properties\/([^/]+)$/);
    if (detailMatch && (!init || init.method === 'GET' || !init.method)) {
      var ref = decodeURIComponent(detailMatch[1]);
      var prop = MOCK_PROPERTIES.find(function(p) { return p.reference === ref || String(p.id) === ref; });
      console.log('[Mock] Intercepted detail:', ref, prop ? 'found' : 'not found');
      if (prop) return mockResponse({ data: prop });
      return mockResponse({ message: 'Not found' }).then(function() {
        return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      });
    }

    // Similar properties
    if (path.match(/\/api\/v1\/properties\/[^/]+\/similar/)) {
      var similar = MOCK_PROPERTIES.slice(0, 6);
      console.log('[Mock] Intercepted similar properties');
      return mockResponse({ data: similar });
    }

    // Sync meta
    if (path.match(/\/api\/v1\/sync-meta/)) {
      return mockResponse({ data: { syncVersion: 1, tenantSlug: 'test-tenant' } });
    }

    // Inquiry submit
    if (path.match(/\/api\/v1\/inquiry/) && init && init.method === 'POST') {
      console.log('[Mock] Intercepted inquiry submit');
      return mockResponse({ data: { success: true, message: 'Inquiry sent (mock)' } });
    }

    // Share favorites / email wishlist
    if (path.match(/\/api\/v1\/share-favorites/) && init && init.method === 'POST') {
      console.log('[Mock] Intercepted share-favorites');
      return mockResponse({ data: { success: true, message: 'Shared (mock)' } });
    }

    // Wishlist PDF download
    if (path.match(/\/api\/v1\/wishlist\/pdf/) && init && init.method === 'POST') {
      console.log('[Mock] Intercepted wishlist PDF download');
      return Promise.resolve(new Response(new Blob(['Mock PDF content'], { type: 'application/pdf' }), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' }
      }));
    }

    // Track event
    if (path.match(/\/api\/v1\/track/)) {
      return mockResponse({ data: { success: true } });
    }

    // Local data files (fallback when /spw-data/ doesn't exist)
    if (path.match(/\/spw-data\//)) {
      return Promise.resolve(new Response('', { status: 404 }));
    }

    // Everything else — pass through to real fetch
    return realFetch(input, init);
  };

  console.log('[Mock] Fetch interceptor installed — API calls will return mock data');
})();
