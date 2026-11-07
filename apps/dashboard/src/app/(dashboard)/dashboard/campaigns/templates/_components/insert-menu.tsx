'use client';

import { Braces } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useEditorText } from '../_i18n';

export const LOOP_SNIPPET = `{{#properties}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
  <tr><td><a href="{{property.url}}"><img src="{{property.image}}" alt="{{property.title}}" width="560" style="display:block;width:100%;height:auto;border:0"></a></td></tr>
  <tr><td style="padding:12px 0 0;font-family:Arial,sans-serif">
    <p style="margin:0;font-size:18px;font-weight:bold">{{property.title}}</p>
    <p style="margin:4px 0;color:#64748b">{{property.location}} · {{property.beds}} bed · {{property.area}}</p>
    <p style="margin:0 0 10px;font-size:18px;font-weight:bold;color:{{agency.color}}">{{property.price}}</p>
    <a href="{{property.url}}" style="display:inline-block;padding:10px 18px;background:{{agency.color}};color:#ffffff;text-decoration:none;border-radius:4px">View property</a>
  </td></tr>
</table>
{{/properties}}`;

export const LEAD_SNIPPET = `{{#lead_property}}
<a href="{{property.url}}"><img src="{{property.image}}" alt="{{property.title}}" width="600" style="display:block;width:100%;height:auto;border:0"></a>
<h2 style="margin:16px 0 6px;font-family:Georgia,serif;font-size:26px;line-height:32px">{{property.title}}</h2>
<p style="margin:0 0 6px;font-family:Arial,sans-serif;color:#64748b">{{property.location}} · {{property.facts}}</p>
<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:22px;font-weight:bold">{{property.price}}</p>
{{/lead_property}}`;

export const OTHERS_SNIPPET = `{{#has_other_properties}}
<h3 style="margin:24px 0 12px;font-family:Georgia,serif;font-size:20px">More homes</h3>
{{#other_properties}}
<p style="margin:0 0 12px;font-family:Arial,sans-serif"><a href="{{property.url}}" style="font-weight:bold">{{property.title}}</a><br>{{property.location}} · {{property.price}}</p>
{{/other_properties}}
{{/has_other_properties}}`;

const LABELS: Record<string, string> = {
  loop: '{{#properties}} … {{/properties}}',
  lead: '{{#lead_property}} … {{/lead_property}}',
  others: '{{#other_properties}} … {{/other_properties}}',
};

const GROUPS: { key: 'contact' | 'agency' | 'listings' | 'other'; items: { id: string; snippet: string }[] }[] = [
  { key: 'contact', items: ['contact.first_name', 'contact.name', 'contact.email'].map((id) => ({ id, snippet: `{{${id}}}` })) },
  { key: 'agency', items: ['agency.name', 'agency.logo', 'agency.phone', 'agency.email', 'agency.website', 'agency.color', 'agency.on_color', 'agency.color_soft'].map((id) => ({ id, snippet: `{{${id}}}` })) },
  { key: 'listings', items: [{ id: 'loop', snippet: LOOP_SNIPPET }, { id: 'lead', snippet: LEAD_SNIPPET }, { id: 'others', snippet: OTHERS_SNIPPET }, { id: 'properties', snippet: '{{properties}}' }] },
  { key: 'other', items: [{ id: 'unsubscribe_link', snippet: '<a href="{{unsubscribe_link}}">Unsubscribe</a>' }] },
];

export function InsertMenu({ onInsert, disabled = false }: { onInsert: (snippet: string) => void; disabled?: boolean }) {
  const t = useEditorText();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} data-testid="insert-menu"><Braces className="mr-1 h-4 w-4" />{t.insert.button}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        {GROUPS.map((g, gi) => (
          <div key={g.key}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{t.insert[g.key]}</DropdownMenuLabel>
            {g.items.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => onInsert(item.snippet)} className="flex flex-col items-start gap-0.5">
                <code className="text-xs">{LABELS[item.id] ?? `{{${item.id}}}`}</code>
                <span className="text-xs text-muted-foreground">{t.insert.items[item.id]}</span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
