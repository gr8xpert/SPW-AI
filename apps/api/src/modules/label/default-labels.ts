export interface DefaultLabel {
  key: string;
  translations: Record<string, string>;
}

export const DEFAULT_LABELS: DefaultLabel[] = [
  // Search form
  { key: 'search.title', translations: { en: 'Property Search', es: 'Búsqueda de Propiedades' } },
  { key: 'search.location', translations: { en: 'Location', es: 'Ubicación' } },
  { key: 'search.type', translations: { en: 'Property Type', es: 'Tipo de Propiedad' } },
  { key: 'search.minPrice', translations: { en: 'Min Price', es: 'Precio Mínimo' } },
  { key: 'search.maxPrice', translations: { en: 'Max Price', es: 'Precio Máximo' } },
  { key: 'search.bedrooms', translations: { en: 'Bedrooms', es: 'Dormitorios' } },
  { key: 'search.bathrooms', translations: { en: 'Bathrooms', es: 'Baños' } },
  { key: 'search.button', translations: { en: 'Search', es: 'Buscar' } },
  { key: 'search.reset', translations: { en: 'Reset', es: 'Restablecer' } },
  { key: 'search.any', translations: { en: 'Any', es: 'Cualquiera' } },
  // Results
  { key: 'results.title', translations: { en: 'Search Results', es: 'Resultados de Búsqueda' } },
  { key: 'results.count', translations: { en: '{count} properties found', es: '{count} propiedades encontradas' } },
  { key: 'results.noResults', translations: { en: 'No properties found', es: 'No se encontraron propiedades' } },
  { key: 'results.sortBy', translations: { en: 'Sort by', es: 'Ordenar por' } },
  { key: 'results.featured', translations: { en: 'Featured', es: 'Destacado' } },
  // Property detail
  { key: 'detail.price', translations: { en: 'Price', es: 'Precio' } },
  { key: 'detail.priceOnRequest', translations: { en: 'Price on Request', es: 'Precio bajo consulta' } },
  { key: 'detail.bedrooms', translations: { en: 'Bedrooms', es: 'Dormitorios' } },
  { key: 'detail.bathrooms', translations: { en: 'Bathrooms', es: 'Baños' } },
  { key: 'detail.buildSize', translations: { en: 'Built Size', es: 'Tamaño Construido' } },
  { key: 'detail.plotSize', translations: { en: 'Plot Size', es: 'Tamaño de Parcela' } },
  { key: 'detail.terraceSize', translations: { en: 'Terrace Size', es: 'Tamaño de Terraza' } },
  { key: 'detail.features', translations: { en: 'Features', es: 'Características' } },
  { key: 'detail.description', translations: { en: 'Description', es: 'Descripción' } },
  { key: 'detail.location', translations: { en: 'Location', es: 'Ubicación' } },
  { key: 'detail.reference', translations: { en: 'Reference', es: 'Referencia' } },
  { key: 'detail.contactAgent', translations: { en: 'Contact Agent', es: 'Contactar Agente' } },
  // Units
  { key: 'unit.sqm', translations: { en: 'm²', es: 'm²' } },
  { key: 'unit.sqft', translations: { en: 'sq ft', es: 'pies²' } },
  // Listing types
  { key: 'listing.sale', translations: { en: 'For Sale', es: 'En Venta' } },
  { key: 'listing.rent', translations: { en: 'For Rent', es: 'En Alquiler' } },
  { key: 'listing.development', translations: { en: 'New Development', es: 'Obra Nueva' } },
];
