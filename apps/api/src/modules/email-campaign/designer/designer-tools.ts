import type { ToolDefinition } from '../../ai/ai.service';
import { checkTemplate } from '../template-check';
import { layoutByName, LAYOUTS } from './layouts';
import { composeDesign, SECTION_NAMES, THEME_NAMES, validSections, type SectionCopy, type ThemeName } from './sections';

// The tools the AI designer calls, and how they change the design. Every
// change is checked; a change that breaks the template is refused and the
// model is told why, so it can fix it itself.

export interface DesignState {
  html: string;
  subject: string;
  notes: string[];
  changed: boolean;
  /** True when the latest accepted html change came from use_layout (version source 'layout'). */
  layoutApplied?: boolean;
}

// The words of a composed design, shared by compose_design and the three directions.
export const COPY_SCHEMA = {
  type: 'object',
  description: "The words of the design, in the client's language. Leave out what is not needed.",
  properties: {
    kicker: { type: 'string', description: 'Very short line above the headline.' },
    headline: { type: 'string' },
    intro: { type: 'string', description: 'One or two sentences. Use {{contact.first_name}}.' },
    body: { type: 'string', description: 'text-block words.' },
    cta: { type: 'string', description: 'Main button words.' },
    ctaUrl: { type: 'string', description: 'https address, mailto: address, or {{agency.website}}.' },
    view: { type: 'string', description: 'Button on each listing, e.g. View property.' },
    moreTitle: { type: 'string', description: 'Heading above the other listings.' },
    contactTitle: { type: 'string' },
    contactText: { type: 'string' },
    quote: { type: 'string' },
    quoteBy: { type: 'string' },
    points: { type: 'array', description: 'Exactly three, for three-points.', items: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['title', 'text'] } },
    imageUrl: { type: 'string', description: "For image-banner: one of the client's images." },
    imageAlt: { type: 'string' },
    footerText: { type: 'string' },
    unsubscribe: { type: 'string', description: 'The unsubscribe link words.' },
  },
};

export const DESIGNER_TOOLS: ToolDefinition[] = [
  { type: 'function', function: { name: 'compose_design', description: 'Build a complete, tested email from a theme and sections. The best way to make any new design.', parameters: { type: 'object', properties: { theme: { type: 'string', enum: [...THEME_NAMES] }, sections: { type: 'array', items: { type: 'string', enum: SECTION_NAMES } }, copy: COPY_SCHEMA, lang: { type: 'string', description: 'Two-letter language of the words.' } }, required: ['theme', 'sections'] } } },
  { type: 'function', function: { name: 'replace_html', description: 'Replace the whole template with a complete new HTML email.', parameters: { type: 'object', properties: { html: { type: 'string', description: 'The complete HTML document.' } }, required: ['html'] } } },
  { type: 'function', function: { name: 'edit_html', description: 'Small changes: each find text must appear exactly once in the current template.', parameters: { type: 'object', properties: { edits: { type: 'array', items: { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' } }, required: ['find', 'replace'] } } }, required: ['edits'] } } },
  { type: 'function', function: { name: 'use_layout', description: 'Start from a starter design.', parameters: { type: 'object', properties: { name: { type: 'string', enum: LAYOUTS.map((l) => l.name) } }, required: ['name'] } } },
  { type: 'function', function: { name: 'set_subject', description: 'Set the email subject line (placeholders allowed).', parameters: { type: 'object', properties: { subject: { type: 'string' } }, required: ['subject'] } } },
  { type: 'function', function: { name: 'save_brand_note', description: "Remember one lasting preference of this client's brand (one short sentence).", parameters: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] } } },
];

export function applyEdits(html: string, edits: { find: string; replace: string }[]): { ok: true; html: string } | { ok: false; error: string } {
  let out = html;
  for (const [i, e] of edits.entries()) {
    if (typeof e?.find !== 'string' || !e.find || typeof e.replace !== 'string') return { ok: false, error: `edit ${i + 1} is malformed` };
    const count = out.split(e.find).length - 1;
    if (count !== 1) return { ok: false, error: `edit ${i + 1}: the find text appears ${count} times (must be exactly once)` };
    out = out.replace(e.find, () => e.replace);
  }
  return { ok: true, html: out };
}

function accept(state: DesignState, html: string, fromLayout = false): string {
  const check = checkTemplate(html);
  if (check.errors.length) return `ERROR: the result has ${check.errors.join(', ')}. The design was not changed; fix it and try again.`;
  state.html = check.html;
  state.changed = true;
  state.layoutApplied = fromLayout;
  const warn = check.warnings.length ? ` Warnings: ${check.warnings.join(', ')}.` : '';
  return `OK: design updated.${warn}`;
}

export function runDesignerTool(state: DesignState, name: string, rawArgs: string): string {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || '{}');
  } catch {
    return 'ERROR: the tool arguments were not valid JSON.';
  }
  if (!args || typeof args !== 'object') return 'ERROR: the tool arguments must be a JSON object.';
  switch (name) {
    case 'replace_html':
      return typeof args.html === 'string' && args.html.trim() ? accept(state, args.html) : 'ERROR: html is empty.';
    case 'edit_html': {
      const res = applyEdits(state.html, Array.isArray(args.edits) ? (args.edits as { find: string; replace: string }[]) : []);
      return res.ok ? accept(state, res.html) : `ERROR: ${res.error}. Use replace_html with the full template instead.`;
    }
    case 'use_layout': {
      const layout = layoutByName(String(args.name));
      if (!layout) return `ERROR: unknown layout. Choose one of ${LAYOUTS.map((l) => l.name).join(', ')}.`;
      const res = accept(state, layout.html, true);
      if (!res.startsWith('OK')) return res;
      if (!state.subject.trim()) state.subject = layout.subject;
      return `${res} The layout is now the current template:\n${state.html}`;
    }
    case 'compose_design': {
      if (!THEME_NAMES.includes(args.theme as ThemeName)) return `ERROR: unknown theme. Choose one of ${THEME_NAMES.join(', ')}.`;
      const picked = validSections(args.sections);
      if (picked.problem) return `ERROR: ${picked.problem}.`;
      const html = composeDesign({ theme: args.theme as ThemeName, sections: picked.sections, copy: args.copy as SectionCopy, lang: String(args.lang ?? '') });
      const res = accept(state, html);
      return res.startsWith('OK') ? `${res} The design is now the current template:\n${state.html}` : res;
    }
    case 'set_subject': {
      const subject = String(args.subject ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 255);
      if (!subject) return 'ERROR: subject is empty.';
      state.subject = subject;
      state.changed = true;
      return 'OK: subject set.';
    }
    case 'save_brand_note': {
      const note = String(args.note ?? '').trim().slice(0, 200);
      if (!note) return 'ERROR: note is empty.';
      state.notes.push(note);
      return 'OK: noted.';
    }
    default:
      return `ERROR: unknown tool ${name}.`;
  }
}
