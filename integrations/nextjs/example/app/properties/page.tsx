import { SpmBlock } from '@/spm/SpmBlock';

export const metadata = { title: 'Properties for sale and rent' };

export default function PropertiesPage() {
  return (
    <main>
      <h1>Properties</h1>
      {/* Both follow Website Design in the SPM dashboard. */}
      <SpmBlock widget="site-search" />
      <SpmBlock widget="site-listing" />
    </main>
  );
}
