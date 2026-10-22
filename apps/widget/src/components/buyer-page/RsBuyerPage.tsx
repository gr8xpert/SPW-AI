import { useEffect, useState } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { buildPropertyUrl } from '@/core/url-utils';

// The buyer's personal page ([data-spm-widget="buyer-page"]): every property
// their agent sent them, opened from the private link in the email
// (…/my-properties/?t=<code>). The buyer likes a property, says it is not
// for them (with an optional reason) or asks to view it; each click is saved
// on their record and their agent is told. No login: the code is the key.
// All words are client labels (Labels → Buyer Page).

interface PageProperty {
  id: number;
  reference: string;
  title: string;
  place: string;
  facts: string;
  price: string;
  image: string | null;
  url: string | null;
  urlSegment: string;
  slug: string | null;
  state: { liked: boolean; rejected: boolean; rejectReason: string | null; viewing: boolean };
}

interface PageView {
  lang: string;
  agency: { name: string; logo: string | null; color: string; website: string | null };
  buyer: { firstName: string | null };
  agent: { name: string | null; email: string | null; phone: string | null } | null;
  properties: PageProperty[];
}

type Load = 'loading' | 'ready' | 'inactive' | 'error';
type Box = { id: number; kind: 'reject' | 'viewing' } | null;

function pageCode(): string | null {
  try {
    const t = new URLSearchParams(window.location.search).get('t');
    return t && /^[0-9A-Za-z]{16}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}

// The page is personal: keep it out of search engines.
function noIndex(): void {
  if (document.querySelector('meta[name="robots"][data-spm]')) return;
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex,nofollow';
  meta.setAttribute('data-spm', '');
  document.head.appendChild(meta);
}

export default function RsBuyerPage() {
  const { t } = useLabels();
  const config = useConfig();
  const lang = (config.language || 'en').slice(0, 2);
  const apiUrl = config.apiUrl.replace(/\/$/, '');
  const [code] = useState(pageCode);
  const [load, setLoad] = useState<Load>(code ? 'loading' : 'inactive');
  const [view, setView] = useState<PageView | null>(null);
  const [box, setBox] = useState<Box>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    noIndex();
    if (!code) return;
    let live = true;
    fetch(`${apiUrl}/api/v1/buyer-page/${code}?lang=${encodeURIComponent(lang)}`, { headers: { 'X-API-Key': config.apiKey } })
      .then(async (r) => {
        if (!live) return;
        if (r.status === 404 || r.status === 403) return setLoad('inactive');
        if (!r.ok) return setLoad('error');
        const j = await r.json();
        setView((j && 'data' in j ? j.data : j) as PageView);
        setLoad('ready');
      })
      .catch(() => live && setLoad('error'));
    return () => { live = false; };
  }, [apiUrl, config.apiKey, code, lang]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const send = async (p: PageProperty, action: 'like' | 'reject' | 'clear' | 'viewing', note?: string) => {
    setBusy(p.id);
    try {
      const body: Record<string, unknown> = { propertyId: p.id, action };
      if (action === 'reject' && note) body.reason = note;
      if (action === 'viewing' && note) body.message = note;
      const r = await fetch(`${apiUrl}/api/v1/buyer-page/${code}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const state = ((j && 'data' in j ? j.data : j) as { state: PageProperty['state'] }).state;
      setView((v) => (v ? { ...v, properties: v.properties.map((x) => (x.id === p.id ? { ...x, state } : x)) } : v));
      setToast(t('buyer_page_saved', 'Thank you, your agent has been told.'));
    } catch {
      setToast(t('buyer_page_error', 'Something went wrong. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const openBox = (id: number, kind: 'reject' | 'viewing') => {
    setBox({ id, kind });
    setText('');
  };

  if (load === 'loading') {
    return <div class="rs-buyer-page rs-buyer-page--loading" aria-busy="true"><div class="rs-buyer-page__spinner" /></div>;
  }
  if (load !== 'ready' || !view) {
    return (
      <div class="rs-buyer-page">
        <p class="rs-buyer-page__inactive" data-state={load}>
          {load === 'error'
            ? t('buyer_page_error', 'Something went wrong. Please try again.')
            : t('buyer_page_inactive', 'This link is no longer active. Please contact the agency that sent it.')}
        </p>
      </div>
    );
  }

  const intro = view.buyer.firstName
    ? t('buyer_page_intro', 'Hello {name}, these are the properties we selected for you. Tell us what you think of each one.').replace('{name}', view.buyer.firstName)
    : t('buyer_page_intro_anon', 'These are the properties we selected for you. Tell us what you think of each one.');
  const hrefOf = (p: PageProperty) =>
    buildPropertyUrl({ id: p.id, reference: p.reference, title: p.title, urlSegment: p.urlSegment, slug: p.slug }, config);

  return (
    <div class="rs-buyer-page">
      <h2 class="rs-buyer-page__title">{t('buyer_page_title', 'Your properties')}</h2>
      <p class="rs-buyer-page__intro">{intro}</p>
      {!view.properties.length ? (
        <p class="rs-buyer-page__empty">{t('buyer_page_empty', 'There are no properties here yet.')}</p>
      ) : (
        <div class="rs-buyer-page__grid">
          {view.properties.map((p) => {
            const href = hrefOf(p);
            const open = box?.id === p.id ? box.kind : null;
            return (
              <article
                key={p.id}
                class={`rs-buyer-page__card${p.state.rejected ? ' is-rejected' : ''}`}
                data-property={p.id}
                data-liked={p.state.liked ? '1' : '0'}
                data-rejected={p.state.rejected ? '1' : '0'}
                data-viewing={p.state.viewing ? '1' : '0'}
              >
                <a class="rs-buyer-page__photo" href={href}>
                  {p.image ? <img src={p.image} alt="" loading="lazy" /> : null}
                </a>
                <div class="rs-buyer-page__body">
                  <a class="rs-buyer-page__name" href={href}>{p.title || p.reference}</a>
                  <p class="rs-buyer-page__meta">{[p.reference, p.place, p.facts].filter(Boolean).join(' · ')}</p>
                  <p class="rs-buyer-page__price">{p.price}</p>
                  {p.state.rejected && p.state.rejectReason ? <p class="rs-buyer-page__reason">“{p.state.rejectReason}”</p> : null}
                  <div class="rs-buyer-page__actions">
                    <button
                      type="button"
                      class={`rs-buyer-page__btn${p.state.liked ? ' is-on' : ''}`}
                      data-action="like"
                      disabled={busy === p.id}
                      aria-pressed={p.state.liked}
                      onClick={() => { setBox(null); void send(p, p.state.liked ? 'clear' : 'like'); }}
                    >
                      {p.state.liked ? t('buyer_page_liked', 'Liked') : t('buyer_page_like', 'Like')}
                    </button>
                    <button
                      type="button"
                      class={`rs-buyer-page__btn rs-buyer-page__btn--no${p.state.rejected ? ' is-on' : ''}`}
                      data-action="reject"
                      disabled={busy === p.id}
                      aria-pressed={p.state.rejected}
                      onClick={() => (p.state.rejected ? (setBox(null), void send(p, 'clear')) : openBox(p.id, 'reject'))}
                    >
                      {p.state.rejected ? t('buyer_page_rejected', 'Not for me') : t('buyer_page_reject', 'Not for me')}
                    </button>
                    <button
                      type="button"
                      class={`rs-buyer-page__btn${p.state.viewing ? ' is-on' : ''}`}
                      data-action="viewing"
                      disabled={busy === p.id || p.state.viewing}
                      onClick={() => openBox(p.id, 'viewing')}
                    >
                      {p.state.viewing ? t('buyer_page_viewing_requested', 'Viewing requested') : t('buyer_page_viewing', 'Request a viewing')}
                    </button>
                  </div>
                  {open ? (
                    <div class="rs-buyer-page__box" data-box={open}>
                      <textarea
                        rows={3}
                        maxLength={open === 'reject' ? 255 : 1000}
                        value={text}
                        placeholder={
                          open === 'reject'
                            ? t('buyer_page_reason_placeholder', 'Why not? (optional) For example: ground floor')
                            : t('buyer_page_viewing_message', 'A message for your agent (optional), e.g. which days suit you')
                        }
                        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
                      />
                      <div class="rs-buyer-page__box-row">
                        <button type="button" class="rs-buyer-page__cancel" onClick={() => setBox(null)}>{t('buyer_page_cancel', 'Cancel')}</button>
                        <button
                          type="button"
                          class="rs-buyer-page__send"
                          onClick={() => {
                            const note = text.trim();
                            setBox(null);
                            void send(p, open, note || undefined);
                          }}
                        >
                          {t('buyer_page_send', 'Send')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {view.agent && (view.agent.name || view.agent.email) ? (
        <p class="rs-buyer-page__agent">
          <strong>{t('buyer_page_agent', 'Your agent')}:</strong> {view.agent.name}
          {view.agent.email ? <> · <a href={`mailto:${view.agent.email}`}>{view.agent.email}</a></> : null}
        </p>
      ) : null}
      {toast ? <div class="rs-buyer-page__toast" role="status">{toast}</div> : null}
    </div>
  );
}
