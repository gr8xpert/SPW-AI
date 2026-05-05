import { useMemo } from 'preact/hooks';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

function getEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const id = u.hostname.includes('youtu.be')
        ? u.pathname.slice(1)
        : u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes('vimeo.com')) {
      const match = u.pathname.match(/\/(\d+)/);
      return match ? `https://player.vimeo.com/video/${match[1]}` : null;
    }
  } catch { /* invalid url */ }
  return null;
}

export default function RsDetailVideoEmbed() {
  const property = useSelector(selectors.getSelectedProperty);
  const embedUrl = useMemo(
    () => property?.videoUrl ? getEmbedUrl(property.videoUrl) : null,
    [property?.videoUrl],
  );

  if (!embedUrl) return null;

  return (
    <div class="rs-detail-video">
      <iframe
        class="rs-detail-video__iframe"
        src={embedUrl}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        title="Property video"
      />
    </div>
  );
}
