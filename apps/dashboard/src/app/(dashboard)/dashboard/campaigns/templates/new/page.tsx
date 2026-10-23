'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { useEditorText } from '../_i18n';
import { unwrap } from '../_components/use-template-editor';

// Creates an empty template, then opens it in the editor.
function CreateAndOpen() {
  const api = useApi();
  const router = useRouter();
  const t = useEditorText();
  const started = useRef(false);
  useEffect(() => {
    if (!api.isReady || started.current) return;
    started.current = true;
    api.post('/api/dashboard/email-templates', { name: t.untitled, subject: '', bodyHtml: '', type: 'custom' })
      .then((res) => router.replace(`/dashboard/campaigns/templates/${unwrap<{ id: number }>(res).id}`))
      .catch(() => router.replace('/dashboard/campaigns'));
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
}

export default function NewTemplatePage() {
  const t = useEditorText();
  return (
    <LockedRouteGuard addon="emailCampaign" featureName={t.featureName}>
      <CreateAndOpen />
    </LockedRouteGuard>
  );
}
