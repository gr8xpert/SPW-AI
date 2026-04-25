interface SkeletonProps {
  type?: 'text' | 'card' | 'search' | 'rect';
  width?: string;
  height?: string;
  lines?: number;
  count?: number;
}

export default function Skeleton({ type = 'rect', width, height, lines = 1, count = 1 }: SkeletonProps) {
  if (type === 'card') {
    return (
      <div class="rs-skeleton-grid">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} class="rs-skeleton-card" style={`--i:${i}`}>
            <div class="rs-skeleton rs-skeleton--image" />
            <div class="rs-skeleton-card__body">
              <div class="rs-skeleton rs-skeleton--text" style={{ width: '60%' }} />
              <div class="rs-skeleton rs-skeleton--text" style={{ width: '40%' }} />
              <div class="rs-skeleton rs-skeleton--text" style={{ width: '80%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'search') {
    return (
      <div class="rs-skeleton-search">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} class="rs-skeleton rs-skeleton--input" />
        ))}
        <div class="rs-skeleton rs-skeleton--button" />
      </div>
    );
  }

  if (type === 'text') {
    return (
      <div class="rs-skeleton-lines">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            class="rs-skeleton rs-skeleton--text"
            style={{ width: i === lines - 1 ? '60%' : '100%' }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      class="rs-skeleton"
      style={{ width: width || '100%', height: height || '1em' }}
    />
  );
}
