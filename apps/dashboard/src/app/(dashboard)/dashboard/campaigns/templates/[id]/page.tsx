'use client';

import { useParams } from 'next/navigation';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { TemplateEditor } from '../_components/template-editor';
import { useEditorText } from '../_i18n';

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const t = useEditorText();
  return (
    <LockedRouteGuard addon="emailCampaign" featureName={t.featureName}>
      <TemplateEditor id={Number(id)} />
    </LockedRouteGuard>
  );
}
