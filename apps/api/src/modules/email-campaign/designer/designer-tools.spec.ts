import { applyEdits, runDesignerTool, type DesignState } from './designer-tools';

const state = (html = '<p>Hello</p><a style="background:#000">Go</a>{{unsubscribe_link}}'): DesignState => ({ html, subject: 'S', notes: [], changed: false });

describe('applyEdits', () => {
  it('applies edits that match exactly once, in order', () => {
    expect(applyEdits('<a>1</a><b>2</b>', [{ find: '<a>1</a>', replace: '<a>one</a>' }, { find: '<b>2</b>', replace: '' }])).toEqual({ ok: true, html: '<a>one</a>' });
  });
  it('fails when a find text is missing or appears twice', () => {
    expect(applyEdits('<p>x</p>', [{ find: '<p>y</p>', replace: '' }])).toMatchObject({ ok: false });
    expect(applyEdits('<p>x</p><p>x</p>', [{ find: '<p>x</p>', replace: '' }])).toMatchObject({ ok: false });
  });
});

describe('runDesignerTool', () => {
  it('replace_html swaps the design and marks it changed', () => {
    const s = state();
    expect(runDesignerTool(s, 'replace_html', JSON.stringify({ html: '<p>New</p>{{unsubscribe_link}}' }))).toMatch(/^OK/);
    expect(s.html).toBe('<p>New</p>{{unsubscribe_link}}');
    expect(s.changed).toBe(true);
    expect(s.layoutApplied).toBeFalsy();
  });
  it('edit_html reports a failed edit and leaves the design alone', () => {
    const s = state();
    expect(runDesignerTool(s, 'edit_html', JSON.stringify({ edits: [{ find: 'nope', replace: 'x' }] }))).toMatch(/^ERROR/);
    expect(s.changed).toBe(false);
  });
  it('rejects a result with an unbalanced loop, keeping the previous design', () => {
    const s = state();
    expect(runDesignerTool(s, 'replace_html', JSON.stringify({ html: '{{#properties}}<p>x</p>' }))).toMatch(/LOOP_UNBALANCED/);
    expect(s.html).toContain('Hello');
  });
  it('use_layout, set_subject and save_brand_note', () => {
    const s = state();
    expect(runDesignerTool(s, 'use_layout', JSON.stringify({ name: 'luxury' }))).toMatch(/^OK/);
    expect(s.html).toContain('{{#properties}}');
    expect(s.layoutApplied).toBe(true);
    runDesignerTool(s, 'set_subject', JSON.stringify({ subject: 'New villas for {{contact.first_name}}' }));
    expect(s.subject).toBe('New villas for {{contact.first_name}}');
    runDesignerTool(s, 'save_brand_note', JSON.stringify({ note: 'Prefers dark blue and gold' }));
    expect(s.notes).toEqual(['Prefers dark blue and gold']);
  });
  it('answers unknown tools and bad JSON with an error', () => {
    expect(runDesignerTool(state(), 'nope', '{}')).toMatch(/^ERROR/);
    expect(runDesignerTool(state(), 'replace_html', '{bad')).toMatch(/^ERROR/);
  });
});
