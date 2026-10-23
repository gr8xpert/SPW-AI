'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Brain, ImagePlus, LayoutTemplate, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { templateErrors, unwrap, useTemplateEditor } from './use-template-editor';
import { CodePane } from './code-pane';
import { PreviewPane } from './preview-pane';
import { InsertMenu } from './insert-menu';
import { HistoryMenu } from './history-menu';
import { ImageLibrary, imageTag } from './image-library';
import { DesignerChat } from './designer-chat';
import type { CodeEditorApi } from './code-editor-impl';
import { LayoutPicker } from './layout-picker';
import { BrandMemoryDialog } from './brand-memory-dialog';
import { useEditorText } from '../_i18n';

function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

// Full-page template editor: AI designer / code on the left, the email as
// contacts will get it on the right. On a phone the three are tabs.
export function TemplateEditor({ id }: { id: number }) {
  const t = useEditorText();
  const { toast } = useToast();
  const api = useApi();
  const ed = useTemplateEditor(id);
  const wide = useWide();
  const [tab, setTab] = useState<'chat' | 'code' | 'preview'>('chat');
  const insertRef = useRef<CodeEditorApi | null>(null);
  const pendingInserts = useRef<string[]>([]); // inserts made while no editor was there: applied when it is
  const [images, setImages] = useState<null | 'code' | 'chat'>(null);
  const [chatImages, setChatImages] = useState<string[]>([]); // attach to the next chat message
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [designing, setDesigning] = useState(false); // an AI turn is running: manual edits are locked

  const dirty = ed.dirty;
  // App-router links don't fire beforeunload: ask before any in-app link leaves unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page (#hash)
      if (!confirm(t.unsavedLeave)) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('click', guard, true);
    return () => document.removeEventListener('click', guard, true);
  }, [dirty, t.unsavedLeave]);

  const insert = (text: string) => {
    if (insertRef.current?.insert(text)) return;
    insertRef.current = null;
    pendingInserts.current.push(text);
    setTab('code'); // show the editor; the text goes in as soon as it is there
  };
  const onEditorReady = (a: CodeEditorApi) => {
    insertRef.current = a;
    const queued = pendingInserts.current.splice(0);
    queued.forEach((s) => a.insert(s));
  };

  const onSave = async () => {
    try {
      await ed.save();
      toast({ title: t.saved });
    } catch (err) {
      const errors = templateErrors(err);
      const description = errors.length ? errors.map((e) => t.invalid[e] ?? e).join(' ') : (err as Error)?.message;
      toast({ title: t.saveFailed, description, variant: 'destructive' });
    }
  };

  // A version the AI saved, loaded into the editor unsaved (like Undo).
  const loadVersion = async (versionId: number) => {
    if (designing) return;
    if (ed.dirty && !confirm(t.chat.confirmLoadVersion)) return;
    try {
      const v = unwrap<{ subject: string; bodyHtml: string }>(await api.get(`/api/dashboard/email-templates/${id}/versions/${versionId}`));
      ed.setDraft({ subject: v.subject, bodyHtml: v.bodyHtml });
    } catch {
      toast({ title: t.history.loadFailed, variant: 'destructive' });
    }
  };

  const pickLayout = (l: { subject: string; html: string }) => {
    if (designing) return;
    if (ed.dirty && !confirm(t.chat.layoutConfirm)) return;
    ed.setDraft({ bodyHtml: l.html, subject: ed.draft.subject || l.subject });
    setLayoutsOpen(false);
  };

  if (ed.loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (ed.loadFailed) {
    return (
      <div className="space-y-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">{t.loadFailed}</p>
        <Button asChild variant="outline" size="sm"><Link href="/dashboard/campaigns"><ArrowLeft className="mr-1 h-4 w-4" />{t.back}</Link></Button>
      </div>
    );
  }

  const code = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <InsertMenu onInsert={insert} disabled={designing} />
        <Button type="button" variant="outline" size="sm" onClick={() => setImages('code')} disabled={designing} data-testid="images-open"><ImagePlus className="mr-1 h-4 w-4" />{t.images.button}</Button>
      </div>
      <CodePane value={ed.draft.bodyHtml} onChange={(v) => ed.setDraft({ bodyHtml: v })} onReady={onEditorReady} readOnly={designing} />
    </div>
  );
  const chat = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setLayoutsOpen(true)} disabled={designing} data-testid="open-layouts"><LayoutTemplate className="mr-1 h-4 w-4" />{t.chat.layouts}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setMemoryOpen(true)} data-testid="open-memory"><Brain className="mr-1 h-4 w-4" />{t.chat.memory}</Button>
      </div>
      <DesignerChat
        templateId={id}
        dirty={ed.dirty}
        saveFirst={ed.save}
        onDesign={ed.applyServer}
        images={chatImages}
        clearImages={() => setChatImages([])}
        removeImage={(url) => setChatImages((l) => l.filter((u) => u !== url))}
        openImages={() => setImages('chat')}
        onLoadVersion={loadVersion}
        onBusyChange={setDesigning}
      />
    </div>
  );
  const preview = <PreviewPane preview={ed.preview} loading={ed.previewLoading} failed={ed.previewFailed} />;

  return (
    <div className="space-y-4" data-testid="template-editor">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link href="/dashboard/campaigns"><ArrowLeft className="mr-1 h-4 w-4" />{t.back}</Link></Button>
        <Input className="h-9 w-56" value={ed.draft.name} placeholder={t.namePlaceholder} maxLength={100} disabled={designing} onChange={(e) => ed.setDraft({ name: e.target.value })} data-testid="template-name" />
        <Input className="h-9 min-w-[16rem] flex-1" value={ed.draft.subject} placeholder={t.subjectPlaceholder} maxLength={255} disabled={designing} onChange={(e) => ed.setDraft({ subject: e.target.value })} data-testid="template-subject" />
        <HistoryMenu templateId={id} reloadKey={ed.reloadKey} dirty={ed.contentDirty} current={ed.draft} disabled={designing} onLoad={(v) => ed.setDraft(v)} onRestored={ed.applyServer} />
        <Button size="sm" onClick={onSave} disabled={designing || !ed.dirty || ed.saving || !ed.draft.name.trim()} data-testid="template-save">
          {ed.saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}{ed.saving ? t.saving : t.save}
        </Button>
      </div>

      <ImageLibrary
        open={images !== null}
        onOpenChange={(o) => { if (!o) setImages(null); }}
        onPick={(url) => { if (images === 'chat') setChatImages((l) => (l.includes(url) ? l : [...l, url].slice(0, 5))); else { insert(imageTag(url)); toast({ title: t.images.inserted }); } }}
      />
      <LayoutPicker open={layoutsOpen} onOpenChange={setLayoutsOpen} onPick={pickLayout} />
      <BrandMemoryDialog open={memoryOpen} onOpenChange={setMemoryOpen} />

      {/* One tree for both widths (CSS decides the layout): chat, code and
          preview stay mounted, so a resize or tab switch never ends a running
          AI turn, releases the editor lock or loses the code editor. Wide:
          chat / code tabs on the left, preview always on the right. */}
      <Tabs value={wide && tab === 'preview' ? 'code' : tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="gap-4 lg:grid lg:grid-cols-2">
          <div className="min-w-0">
            <TabsList><TabsTrigger value="chat">{t.tabs.chat}</TabsTrigger><TabsTrigger value="code">{t.tabs.code}</TabsTrigger><TabsTrigger value="preview" className="lg:hidden">{t.tabs.preview}</TabsTrigger></TabsList>
            <TabsContent value="chat" forceMount className="data-[state=inactive]:hidden">{chat}</TabsContent>
            <TabsContent value="code" forceMount className="data-[state=inactive]:hidden">{code}</TabsContent>
          </div>
          <TabsContent value="preview" forceMount className="min-w-0 data-[state=inactive]:hidden lg:mt-0 lg:data-[state=inactive]:block">{preview}</TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
