import type { ComponentType } from 'preact';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LazyLoader = () => Promise<{ default: ComponentType<any> }>;

const componentMap = new Map<string, LazyLoader>();
const templateMap = new Map<string, LazyLoader>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, ComponentType<any>>();

export function registerComponent(name: string, loader: LazyLoader): void {
  componentMap.set(name, loader);
}

export function registerTemplate(templateId: string, loader: LazyLoader): void {
  templateMap.set(templateId, loader);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getComponent(name: string): Promise<ComponentType<any> | null> {
  const cached = cache.get(`c:${name}`);
  if (cached) return cached;

  const loader = componentMap.get(name);
  if (!loader) return null;

  const mod = await loader();
  cache.set(`c:${name}`, mod.default);
  return mod.default;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTemplate(templateId: string): Promise<ComponentType<any> | null> {
  const cached = cache.get(`t:${templateId}`);
  if (cached) return cached;

  const loader = templateMap.get(templateId);
  if (!loader) return null;

  const mod = await loader();
  cache.set(`t:${templateId}`, mod.default);
  return mod.default;
}

export function isRegistered(name: string): boolean {
  return componentMap.has(name);
}

export function isTemplateRegistered(templateId: string): boolean {
  return templateMap.has(templateId);
}

export function registerAllComponents(): void {
  // Search components
  registerComponent('location', () => import('@/components/search/RsLocation'));
  registerComponent('listing_type', () => import('@/components/search/RsListingType'));
  registerComponent('property_type', () => import('@/components/search/RsPropertyType'));
  registerComponent('bedrooms', () => import('@/components/search/RsBedrooms'));
  registerComponent('bathrooms', () => import('@/components/search/RsBathrooms'));
  registerComponent('price', () => import('@/components/search/RsPrice'));
  registerComponent('built_area', () => import('@/components/search/RsBuiltArea'));
  registerComponent('plot_size', () => import('@/components/search/RsPlotSize'));
  registerComponent('terrace', () => import('@/components/search/RsTerrace'));
  registerComponent('features', () => import('@/components/search/RsFeatures'));
  registerComponent('quick_features', () => import('@/components/search/RsQuickFeatures'));
  registerComponent('reference', () => import('@/components/search/RsReference'));
  registerComponent('search_button', () => import('@/components/search/RsSearchButton'));
  registerComponent('reset_button', () => import('@/components/search/RsResetButton'));

  // Listing components
  registerComponent('property_grid', () => import('@/components/listing/RsPropertyGrid'));
  registerComponent('property_carousel', () => import('@/components/listing/RsPropertyCarousel'));
  registerComponent('pagination', () => import('@/components/listing/RsPagination'));
  registerComponent('sort', () => import('@/components/listing/RsSort'));
  registerComponent('results_count', () => import('@/components/listing/RsResultsCount'));
  registerComponent('active_filters', () => import('@/components/listing/RsActiveFilters'));
  registerComponent('view_toggle', () => import('@/components/listing/RsViewToggle'));
  registerComponent('map_view', () => import('@/components/map/RsMapContainer'));

  // Detail components
  registerComponent('detail', () => import('@/components/detail/RsDetail'));
  registerComponent('detail_gallery', () => import('@/components/detail/RsDetailGallery'));
  registerComponent('detail_title', () => import('@/components/detail/RsDetailTitle'));
  registerComponent('detail_price', () => import('@/components/detail/RsDetailPrice'));
  registerComponent('detail_ref', () => import('@/components/detail/RsDetailRef'));
  registerComponent('detail_location', () => import('@/components/detail/RsDetailLocation'));
  registerComponent('detail_address', () => import('@/components/detail/RsDetailAddress'));
  registerComponent('detail_type', () => import('@/components/detail/RsDetailType'));
  registerComponent('detail_status', () => import('@/components/detail/RsDetailStatus'));
  registerComponent('detail_beds', () => import('@/components/detail/RsDetailBeds'));
  registerComponent('detail_baths', () => import('@/components/detail/RsDetailBaths'));
  registerComponent('detail_built', () => import('@/components/detail/RsDetailBuilt'));
  registerComponent('detail_plot', () => import('@/components/detail/RsDetailPlot'));
  registerComponent('detail_terrace', () => import('@/components/detail/RsDetailTerrace'));
  registerComponent('detail_garden', () => import('@/components/detail/RsDetailGarden'));
  registerComponent('detail_year', () => import('@/components/detail/RsDetailYear'));
  registerComponent('detail_floor', () => import('@/components/detail/RsDetailFloor'));
  registerComponent('detail_orientation', () => import('@/components/detail/RsDetailOrientation'));
  registerComponent('detail_parking', () => import('@/components/detail/RsDetailParking'));
  registerComponent('detail_energy_rating', () => import('@/components/detail/RsDetailEnergyRating'));
  registerComponent('detail_community_fees', () => import('@/components/detail/RsDetailCommunityFees'));
  registerComponent('detail_description', () => import('@/components/detail/RsDetailDescription'));
  registerComponent('detail_features', () => import('@/components/detail/RsDetailFeatures'));
  registerComponent('detail_specs', () => import('@/components/detail/RsDetailSpecs'));
  registerComponent('detail_resources', () => import('@/components/detail/RsDetailResources'));
  registerComponent('detail_video_embed', () => import('@/components/detail/RsDetailVideoEmbed'));
  registerComponent('detail_video_link', () => import('@/components/detail/RsDetailVideoLink'));
  registerComponent('detail_tour_link', () => import('@/components/detail/RsDetailTourLink'));
  registerComponent('detail_tour_embed', () => import('@/components/detail/RsDetailTourEmbed'));
  registerComponent('detail_pdf', () => import('@/components/detail/RsDetailPdf'));
  registerComponent('detail_map', () => import('@/components/detail/RsDetailMap'));
  registerComponent('detail_related', () => import('@/components/detail/RsDetailRelated'));
  registerComponent('detail_agent', () => import('@/components/detail/RsDetailAgent'));
  registerComponent('detail_inquiry_form', () => import('@/components/detail/RsDetailInquiryForm'));
  registerComponent('detail_share', () => import('@/components/detail/RsDetailShare'));
  registerComponent('detail_wishlist', () => import('@/components/detail/RsDetailWishlist'));
  registerComponent('detail_back', () => import('@/components/detail/RsDetailBack'));
  registerComponent('mortgage_calculator', () => import('@/components/utility/RsMortgageCalculator'));

  // Wishlist components
  registerComponent('wishlist_list', () => import('@/components/wishlist/RsWishlistList'));
  registerComponent('wishlist_header', () => import('@/components/wishlist/RsWishlistHeader'));
  registerComponent('wishlist_grid', () => import('@/components/wishlist/RsWishlistGrid'));
  registerComponent('wishlist_empty', () => import('@/components/wishlist/RsWishlistEmpty'));
  registerComponent('wishlist_actions', () => import('@/components/wishlist/RsWishlistActions'));
  registerComponent('wishlist_sort', () => import('@/components/wishlist/RsWishlistSort'));
  registerComponent('wishlist_compare_btn', () => import('@/components/wishlist/RsWishlistCompareBtn'));
  // wishlist_shared_banner — removed, no functionality
  registerComponent('wishlist_modals', () => import('@/components/wishlist/RsWishlistModals'));
  registerComponent('wishlist_counter', () => import('@/components/utility/RsWishlistCounter'));

  // Map components
  registerComponent('map_container', () => import('@/components/map/RsMapContainer'));
  registerComponent('map_location_tags', () => import('@/components/map/RsMapLocationTags'));
  registerComponent('map_radius_search', () => import('@/components/map/RsMapRadiusSearch'));
  registerComponent('map_results_panel', () => import('@/components/map/RsMapResultsPanel'));
  registerComponent('map_view_toggle', () => import('@/components/map/RsMapViewToggle'));

  // Utility components
  registerComponent('language_selector', () => import('@/components/utility/RsLanguageSelector'));
  registerComponent('currency_selector', () => import('@/components/utility/RsCurrencySelector'));
  registerComponent('share_buttons', () => import('@/components/utility/RsShareButtons'));

  // Chat components
  registerComponent('chat_bubble', () => import('@/components/chat/RsChatBubble'));
  registerComponent('chat_panel', () => import('@/components/chat/RsChatPanel'));

  // Search templates
  registerTemplate('search-template-01', () => import('@/templates/search/SearchTemplate01'));
  registerTemplate('search-template-02', () => import('@/templates/search/SearchTemplate02'));
  registerTemplate('search-template-03', () => import('@/templates/search/SearchTemplate03'));
  registerTemplate('search-template-04', () => import('@/templates/search/SearchTemplate04'));
  registerTemplate('search-template-05', () => import('@/templates/search/SearchTemplate05'));
  registerTemplate('search-template-06', () => import('@/templates/search/SearchTemplate06'));

  // Listing templates
  registerTemplate('listing-template-01', () => import('@/templates/listing/ListingTemplate01'));
  registerTemplate('listing-template-02', () => import('@/templates/listing/ListingTemplate02'));
  registerTemplate('listing-template-03', () => import('@/templates/listing/ListingTemplate03'));
  registerTemplate('listing-template-04', () => import('@/templates/listing/ListingTemplate04'));
  registerTemplate('listing-template-05', () => import('@/templates/listing/ListingTemplate05'));
  registerTemplate('listing-template-06', () => import('@/templates/listing/ListingTemplate06'));
  registerTemplate('listing-template-07', () => import('@/templates/listing/ListingTemplate07'));
  registerTemplate('listing-template-08', () => import('@/templates/listing/ListingTemplate08'));
  registerTemplate('listing-template-09', () => import('@/templates/listing/ListingTemplate09'));
  registerTemplate('listing-template-10', () => import('@/templates/listing/ListingTemplate10'));
  registerTemplate('listing-template-11', () => import('@/templates/listing/ListingTemplate11'));
  registerTemplate('listing-template-12', () => import('@/templates/listing/ListingTemplate12'));
  registerTemplate('listing-template-13', () => import('@/templates/listing/ListingTemplate13'));

  // Detail templates
  registerTemplate('detail-template-01', () => import('@/templates/detail/DetailTemplate01'));

  // Map templates
  registerTemplate('map-template-01', () => import('@/templates/map/MapTemplate01'));
  registerTemplate('map-template-02', () => import('@/templates/map/MapTemplate02'));
  registerTemplate('map-template-03', () => import('@/templates/map/MapTemplate03'));
}
