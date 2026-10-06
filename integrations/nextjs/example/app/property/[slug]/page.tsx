import { notFound } from 'next/navigation';
import { SpmBlock } from '@/spm/SpmBlock';
import { spmGetProperty, spmJsonLdString, spmPropertyJsonLd, spmPropertyMetadata } from '@/spm/server';

// Every property page is rendered on the server (title, description, preview
// tags and structured data in the HTML) and kept for 10 minutes.
export const revalidate = 600;

type Props = { params: Promise<{ slug: string }> | { slug: string } };

const SITE_NAME = 'Your Agency';

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return spmPropertyMetadata(slug, { siteName: SITE_NAME });
}

export default async function PropertyPage({ params }: Props) {
  const { slug } = await params;
  const property = await spmGetProperty(slug);
  if (!property) notFound(); // a real 404 for sold / removed listings

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: spmJsonLdString(spmPropertyJsonLd(property, { siteName: SITE_NAME })) }}
      />
      {/* The full property page (gallery, details, map, inquiry form) — Website Design → Property page. */}
      <SpmBlock widget="site-detail" />
    </main>
  );
}
