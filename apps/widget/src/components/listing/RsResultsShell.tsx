import type { ComponentChildren } from 'preact';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { useConfig } from '@/hooks/useConfig';
import RsResultsCount from './RsResultsCount';
import RsSort from './RsSort';
import RsViewToggle from './RsViewToggle';
import RsPagination from './RsPagination';
import RsMapContainer from '@/components/map/RsMapContainer';

interface Props {
  children: ComponentChildren;
}

/**
 * The furniture a results page needs around its cards: how many were found,
 * how they are ordered and in which shape to show them, with the page numbers
 * below.
 *
 * Every listing template used to render its cards and nothing else, so a site
 * built from one had no count, no sort, no way to switch view and no way past
 * the first page — the parts existed as blocks but nobody knew to add them by
 * hand. A curated list (see block-role) never gets this; "our featured six"
 * has nothing to page through.
 */
export default function RsResultsShell({ children }: Props) {
  const ui = useSelector(selectors.getUI);
  const config = useConfig();
  const onMap = ui.layout === 'map' && config.enableMapView !== false;

  return (
    <div class="rs-results">
      <div class="rs-results__bar">
        <RsResultsCount />
        <div class="rs-results__tools">
          <RsSort />
          <RsViewToggle />
        </div>
      </div>

      {/* The map shows every listing that matches, grouped until you zoom in,
          so it replaces the cards rather than sitting beside them. */}
      {onMap ? (
        <div class="rs-results__map">
          <RsMapContainer areaSearch />
        </div>
      ) : (
        children
      )}

      {/* Page numbers mean nothing on a map that already holds every match. */}
      {!onMap && (
        <div class="rs-results__pagination">
          <RsPagination />
        </div>
      )}
    </div>
  );
}
