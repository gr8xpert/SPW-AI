export interface Labels {
  // Search
  search_button: string;
  reset_button: string;
  advanced_search: string;
  location_placeholder: string;
  location_all: string;
  listing_type_all: string;
  listing_type_sale: string;
  listing_type_rent: string;
  listing_type_holiday: string;
  listing_type_development: string;
  property_type_all: string;
  bedrooms_label: string;
  bedrooms_any: string;
  bathrooms_label: string;
  bathrooms_any: string;
  price_min: string;
  price_max: string;
  price_on_request: string;
  built_area_label: string;
  plot_size_label: string;
  features_label: string;
  reference_label: string;
  reference_placeholder: string;

  // Results
  results_showing: string;
  results_of: string;
  results_properties: string;
  results_no_results: string;
  results_no_results_message: string;
  sort_label: string;
  sort_featured: string;
  sort_price_asc: string;
  sort_price_desc: string;
  sort_date_asc: string;
  sort_date_desc: string;

  // Property card
  card_bedrooms: string;
  card_bathrooms: string;
  card_build_size: string;
  card_plot_size: string;
  card_view_details: string;
  card_featured: string;
  card_for_sale: string;
  card_for_rent: string;
  card_holiday_rent: string;
  card_development: string;

  // Detail
  detail_description: string;
  detail_features: string;
  detail_specifications: string;
  detail_location: string;
  detail_similar: string;
  detail_back: string;
  detail_share: string;
  detail_save: string;
  detail_saved: string;
  detail_video: string;
  detail_virtual_tour: string;
  detail_pdf: string;
  detail_energy_rating: string;
  detail_community_fees: string;
  detail_year_built: string;
  detail_floor: string;
  detail_orientation: string;
  detail_parking: string;
  detail_terrace: string;
  detail_garden: string;

  // Inquiry
  inquiry_title: string;
  inquiry_name: string;
  inquiry_email: string;
  inquiry_phone: string;
  inquiry_message: string;
  inquiry_send: string;
  inquiry_success: string;
  inquiry_error: string;

  // Wishlist
  wishlist_title: string;
  wishlist_empty: string;
  wishlist_remove: string;
  wishlist_share: string;
  wishlist_compare: string;
  wishlist_shared_banner: string;

  // Map
  map_search_address: string;
  map_radius: string;
  map_view_all: string;
  map_zones: string;
  map_properties: string;
  map_list_view: string;
  map_map_view: string;

  // Pagination
  pagination_prev: string;
  pagination_next: string;
  pagination_page: string;

  // General
  loading: string;
  error: string;
  close: string;
  currency_label: string;
  language_label: string;
  active_filters: string;
  clear_all: string;

  // Mortgage
  mortgage_title: string;
  mortgage_price: string;
  mortgage_down_payment: string;
  mortgage_interest: string;
  mortgage_years: string;
  mortgage_monthly: string;

  [key: string]: string;
}
