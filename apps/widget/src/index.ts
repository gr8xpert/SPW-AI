/**
 * Smart Property Widget (SPW)
 * Embeddable property search widget
 *
 * Usage:
 *
 * <div id="property-widget"></div>
 * <script src="https://cdn.example.com/spw-widget.iife.js"></script>
 * <script>
 *   const widget = new SPW.Widget({
 *     apiUrl: 'https://api.example.com',
 *     apiKey: 'your-api-key',
 *     container: '#property-widget',
 *   });
 *   widget.init();
 * </script>
 */

import { SPWWidget } from './core/Widget';
import type {
  SPWConfig,
  Property,
  SearchFilters,
  SearchResults,
  InquiryData,
  Labels,
  SPWEvents,
} from './types';

// Export for ES modules
export { SPWWidget as Widget };
export type {
  SPWConfig,
  Property,
  SearchFilters,
  SearchResults,
  InquiryData,
  Labels,
  SPWEvents,
};

// Export for IIFE bundle (global SPW object)
export default {
  Widget: SPWWidget,
};

// Auto-initialization from data attributes
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Find elements with data-spw-widget attribute
    const autoInitElements = document.querySelectorAll('[data-spw-widget]');

    autoInitElements.forEach((element) => {
      const container = element as HTMLElement;
      const apiUrl = container.dataset.spwApiUrl;
      const apiKey = container.dataset.spwApiKey;

      if (!apiUrl || !apiKey) {
        console.error('SPW Widget: Missing required data-spw-api-url or data-spw-api-key attribute');
        return;
      }

      const widget = new SPWWidget({
        apiUrl,
        apiKey,
        container,
        dataPath: container.dataset.spwDataPath,
        language: container.dataset.spwLanguage,
        currency: container.dataset.spwCurrency,
        theme: container.dataset.spwTheme as 'light' | 'dark' | 'auto',
        layout: container.dataset.spwLayout as 'grid' | 'list',
        resultsPerPage: container.dataset.spwResultsPerPage ? Number(container.dataset.spwResultsPerPage) : undefined,
        showFilters: container.dataset.spwShowFilters !== 'false',
        showSorting: container.dataset.spwShowSorting !== 'false',
        showPagination: container.dataset.spwShowPagination !== 'false',
        enableFavorites: container.dataset.spwEnableFavorites !== 'false',
        enableInquiry: container.dataset.spwEnableInquiry !== 'false',
        enableTracking: container.dataset.spwEnableTracking !== 'false',
      });

      widget.init().catch((error) => {
        console.error('SPW Widget: Auto-initialization failed', error);
      });

      // Store widget instance on element
      (container as HTMLElement & { spwWidget?: SPWWidget }).spwWidget = widget;
    });
  });
}
