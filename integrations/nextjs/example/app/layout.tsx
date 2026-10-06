import type { Metadata } from 'next';
import { SpmWidget } from '@/spm/SpmWidget';
import { spmWidgetVersion } from '@/spm/server';
import { SPM } from '@/spm/config';

export const metadata: Metadata = {
  // Lets canonical / Open Graph addresses resolve to full URLs.
  metadataBase: SPM.siteUrl ? new URL(SPM.siteUrl) : undefined,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Once, at the end of the body: loads the widget and follows the router. */}
        <SpmWidget version={await spmWidgetVersion()} resultsPage="/properties" />
      </body>
    </html>
  );
}
