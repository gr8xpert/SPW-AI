import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

const RATINGS: Array<{ letter: string; color: string }> = [
  { letter: 'A', color: '#00a651' },
  { letter: 'B', color: '#50b848' },
  { letter: 'C', color: '#bfd72f' },
  { letter: 'D', color: '#fff200' },
  { letter: 'E', color: '#fcb813' },
  { letter: 'F', color: '#f37021' },
  { letter: 'G', color: '#ed1c24' },
];

export default function RsDetailEnergyRating() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);

  const rawValue = property?.energyRating?.toString().trim().toUpperCase();
  const activeIndex = rawValue ? RATINGS.findIndex((r) => r.letter === rawValue) : -1;
  const isNA = activeIndex === -1;

  return (
    <div class="rs-detail-section rs-detail-energy">
      <h2 class="rs-detail-section__heading">
        {t('detail_energy_rating', 'Energy Certificate')}
      </h2>
      <div
        class={`rs-detail-energy__chart${isNA ? ' rs-detail-energy__chart--na' : ''}`}
        role="img"
        aria-label={isNA ? 'Energy rating not available' : `Energy rating ${rawValue}`}
      >
        {RATINGS.map((r, i) => {
          const isActive = !isNA && i === activeIndex;
          const widthPct = 35 + (i * 7);
          return (
            <div
              key={r.letter}
              class={`rs-detail-energy__row${isActive ? ' rs-detail-energy__row--active' : ''}`}
            >
              <div
                class="rs-detail-energy__bar"
                style={`width:${widthPct}%;background:${r.color};`}
              >
                <span class="rs-detail-energy__letter">{r.letter}</span>
              </div>
              {isActive && (
                <span class="rs-detail-energy__marker" style={`color:${r.color};`} aria-hidden="true">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span class="rs-detail-energy__marker-letter">{r.letter}</span>
                </span>
              )}
            </div>
          );
        })}
        {isNA && (
          <div class="rs-detail-energy__na" aria-hidden="true">
            {t('detail_energy_na', 'N/A')}
          </div>
        )}
      </div>
    </div>
  );
}
