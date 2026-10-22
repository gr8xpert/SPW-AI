'use client';

import { useEffect, useRef, useState } from 'react';
import { CreditCard, Home, Map as MapIcon, Palette, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import type { WidgetSettings } from './use-widget-settings';
import { WidgetSearchSection } from './widget-search-section';
import { WidgetCardsSection, WidgetPropertyPageSection } from './widget-display-sections';
import { WidgetFormsSection, WidgetLookSection, WidgetMapsSection } from './widget-site-sections';
import { updateQuery } from './widget-ui';
import { useSettingsText } from '../_i18n';

// Settings → Widget: the website's settings in groups, one shown at a time
// (?section= in the address, so a link can open the right one), saved
// together from one bar that appears when something changed.

// Names and descriptions: settingsText widget.sections[id].
const SECTIONS = [
  { id: 'search', icon: Search },
  { id: 'cards', icon: CreditCard },
  { id: 'property', icon: Home },
  { id: 'maps', icon: MapIcon },
  { id: 'look', icon: Palette },
  { id: 'forms', icon: ShieldCheck },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

function isSection(v: string | null): v is SectionId {
  return SECTIONS.some((s) => s.id === v);
}

export function WidgetTab({ widget }: { widget: WidgetSettings }) {
  const { dirty, savingWidget, onSaveWidget, onDiscardWidget } = widget;
  const t = useSettingsText();
  const [section, setSection] = useState<SectionId>('search');
  const discarding = useRef(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('section');
    if (isSection(fromUrl)) setSection(fromUrl);
  }, []);

  // Closing or reloading the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (discarding.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const open = (id: SectionId) => {
    setSection(id);
    updateQuery({ tab: 'widget', section: id });
  };

  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <TabsContent value="widget">
      <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label={t.widget.navLabel} className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {SECTIONS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? 'page' : undefined}
              onClick={() => open(id)}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${section === id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4" />
              {t.widget.sections[id].label}
            </button>
          ))}
        </nav>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t.widget.sections[active.id].label}</CardTitle>
            <CardDescription>{t.widget.sections[active.id].desc}</CardDescription>
          </CardHeader>
          <CardContent>
            {section === 'search' && <WidgetSearchSection widget={widget} />}
            {section === 'cards' && <WidgetCardsSection widget={widget} />}
            {section === 'property' && <WidgetPropertyPageSection widget={widget} />}
            {section === 'maps' && <WidgetMapsSection widget={widget} />}
            {section === 'look' && <WidgetLookSection widget={widget} />}
            {section === 'forms' && <WidgetFormsSection widget={widget} />}
          </CardContent>
        </Card>
      </div>

      {(dirty || savingWidget) && (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
          <p className="text-sm font-medium">{t.widget.unsaved}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={savingWidget}
              onClick={() => {
                discarding.current = true;
                onDiscardWidget();
              }}
            >
              {t.widget.discard}
            </Button>
            <Button size="sm" onClick={onSaveWidget} disabled={savingWidget}>
              {savingWidget ? t.common.saving : t.widget.saveChanges}
            </Button>
          </div>
        </div>
      )}
    </TabsContent>
  );
}
