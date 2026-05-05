import { useConfig } from '@/hooks/useConfig';

interface Props {
  size?: number;
  filled?: boolean;
  class?: string;
}

const HEART_PATH = 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';
const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
const BOOKMARK_PATH = 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z';
const SAVE_PATHS = [
  'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z',
  'M17 21v-8H7v8',
  'M7 3v5h8',
];

function getPaths(icon: string): string[] {
  switch (icon) {
    case 'star': return [STAR_PATH];
    case 'bookmark': return [BOOKMARK_PATH];
    case 'save': return SAVE_PATHS;
    default: return [HEART_PATH];
  }
}

export default function RsWishlistIcon({ size = 20, filled = false, class: className }: Props) {
  const config = useConfig();
  const icon = config.wishlistIcon || 'heart';
  const paths = getPaths(icon);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
    >
      {paths.map(d => <path d={d} />)}
    </svg>
  );
}
