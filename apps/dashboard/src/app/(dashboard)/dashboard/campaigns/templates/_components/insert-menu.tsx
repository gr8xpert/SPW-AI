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

const GROUPS: { key: 'contact' | 'agency' | 'listings' | 'other'; items: { id: string; snippet: string }[] }[] = [
  { key: 'contact', items: ['contact.first_name', 'contact.name', 'contact.email'].map((id) => ({ id, snippet: `{{${id}}}` })) },
  { key: 'agency', items: ['agency.name', 'agency.logo', 'agency.phone', 'agency.email', 'agency.website', 'agency.color'].map((id) => ({ id, snippet: `{{${id}}}` })) },
  { key: 'listings', items: [{ id: 'loop', snippet: LOOP_SNIPPET }, { id: 'properties', snippet: '{{properties}}' }] },
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
                <code className="text-xs">{item.id === 'loop' ? '{{#properties}} … {{/properties}}' : `{{${item.id}}}`}</code>
                <span className="text-xs text-muted-foreground">{t.insert.items[item.id]}</span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
