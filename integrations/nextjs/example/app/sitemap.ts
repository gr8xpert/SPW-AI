import type { MetadataRoute } from 'next';
import { spmSitemap } from '@/spm/server';

// /sitemap.xml: your own pages plus every published property.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL || '';
  return [
    { url: `${site}/`, changeFrequency: 'weekly' },
    { url: `${site}/properties`, changeFrequency: 'daily' },
    ...(await spmSitemap()),
  ];
}
