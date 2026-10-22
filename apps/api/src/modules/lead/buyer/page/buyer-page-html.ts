import { escapeHtml } from '../../../../common/security/escape-html';

// The SPM fallback buyer page (/p/<code>): used until the agency's own
// website has the page. Server-rendered in the buyer's language from the
// client's labels, with the agency's logo and colour. A small script sends
// the reactions; everything else is plain HTML. Pure.

export interface BuyerPageProperty {
  id: number;
  reference: string;
  title: string;
  place: string;
  facts: string;
  price: string;
  image: string | null;
  // The property on the agency's site (from the URL pattern), if known.
  url: string | null;
  urlSegment: string;
  state: { liked: boolean; rejected: boolean; rejectReason: string | null; viewing: boolean };
}

export interface BuyerPageView {
  lang: string;
  agency: { name: string; logo: string | null; color: string; website: string | null };
  buyer: { firstName: string | null };
  agent: { name: string | null; email: string | null; phone: string | null } | null;
  properties: BuyerPageProperty[];
}

// Defaults (English); the client's labels win.
export const BUYER_PAGE_TEXT: Record<string, string> = {
  buyer_page_title: 'Your properties',
  buyer_page_intro: 'Hello {name}, these are the properties we selected for you. Tell us what you think of each one.',
  buyer_page_intro_anon: 'These are the properties we selected for you. Tell us what you think of each one.',
  buyer_page_like: 'Like',
  buyer_page_liked: 'Liked',
  buyer_page_reject: 'Not for me',
  buyer_page_rejected: 'Not for me',
  buyer_page_reason_placeholder: 'Why not? (optional) For example: ground floor',
  buyer_page_send: 'Send',
  buyer_page_cancel: 'Cancel',
  buyer_page_viewing: 'Request a viewing',
  buyer_page_viewing_requested: 'Viewing requested',
  buyer_page_viewing_message: 'A message for your agent (optional), e.g. which days suit you',
  buyer_page_view: 'View property',
  buyer_page_empty: 'There are no properties here yet.',
  buyer_page_inactive: 'This link is no longer active. Please contact the agency that sent it.',
  buyer_page_saved: 'Thank you, your agent has been told.',
  buyer_page_error: 'Something went wrong. Please try again.',
  buyer_page_agent: 'Your agent',
};

function txt(labels: Record<string, string>, key: string): string {
  return labels[key] || BUYER_PAGE_TEXT[key] || key;
}

const CSS = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;color:#1e293b;line-height:1.5}
.wrap{max-width:960px;margin:0 auto;padding:16px}
header{display:flex;align-items:center;gap:12px;padding:16px 0;border-bottom:3px solid var(--c)}
header img{max-height:48px;max-width:180px}header .name{font-weight:700;font-size:18px}
h1{font-size:24px;margin:24px 0 4px}.intro{color:#475569;margin:0 0 20px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;flex-direction:column}
.card[data-rejected="1"] .ph,.card[data-rejected="1"] .title,.card[data-rejected="1"] .price{opacity:.55}
.ph{aspect-ratio:4/3;background:#e2e8f0;display:block}.ph img{width:100%;height:100%;object-fit:cover;display:block}
.body{padding:12px 14px;display:flex;flex-direction:column;gap:4px;flex:1}
.title{font-weight:600;margin:0}.meta{color:#64748b;font-size:13px;margin:0}.price{font-weight:700;margin:2px 0}
.view{color:var(--c);font-weight:600;font-size:14px;text-decoration:none}
.acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:8px}
.acts button{flex:1 1 auto;border:1px solid #cbd5e1;background:#fff;color:#1e293b;border-radius:8px;padding:8px 10px;font:inherit;font-size:14px;cursor:pointer;min-height:40px}
.acts button.on{background:var(--c);border-color:var(--c);color:#fff}
.acts button.no.on{background:#b91c1c;border-color:#b91c1c}
.box{display:none;flex-direction:column;gap:6px;margin-top:8px}.box.open{display:flex}
.box textarea{font:inherit;font-size:14px;border:1px solid #cbd5e1;border-radius:8px;padding:8px;min-height:64px;width:100%}
.box .row{display:flex;gap:6px;justify-content:flex-end}.box button{border:0;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}
.box .send{background:var(--c);color:#fff}.box .cancel{background:#e2e8f0}
.reason{font-size:13px;color:#b91c1c;margin:4px 0 0}
.msg{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;display:none;max-width:90vw}
.agent{margin:28px 0 8px;padding:14px;background:#fff;border-radius:10px;font-size:14px}.agent a{color:var(--c)}
.empty{background:#fff;border-radius:10px;padding:24px;text-align:center;color:#475569}
`;

function head(lang: string, title: string, color: string): string {
  return `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>:root{--c:${color}}${CSS}</style></head>`;
}

export function buildBuyerPageHtml(view: BuyerPageView | null, opts: { labels: Record<string, string>; feedbackUrl: string }): string {
  const L = (k: string) => txt(opts.labels, k);
  if (!view) {
    return `${head('en', L('buyer_page_title'), '#2563eb')}<body><div class="wrap"><div class="empty" style="margin-top:15vh">${escapeHtml(L('buyer_page_inactive'))}</div></div></body></html>`;
  }
  const color = /^#[0-9a-f]{3,8}$/i.test(view.agency.color) ? view.agency.color : '#2563eb';
  const intro = view.buyer.firstName ? L('buyer_page_intro').replace('{name}', view.buyer.firstName) : L('buyer_page_intro_anon');
  const logo = view.agency.logo && /^https?:\/\//i.test(view.agency.logo) ? `<img src="${escapeHtml(view.agency.logo)}" alt="${escapeHtml(view.agency.name)}">` : '';
  const brand = view.agency.website ? `<a href="${escapeHtml(view.agency.website)}" style="display:flex;align-items:center;gap:12px;color:inherit;text-decoration:none">${logo}<span class="name">${escapeHtml(view.agency.name)}</span></a>` : `${logo}<span class="name">${escapeHtml(view.agency.name)}</span>`;

  const cards = view.properties.map((p) => {
    const link = p.url && /^https?:\/\//i.test(p.url) ? escapeHtml(p.url) : null;
    const img = p.image && /^https?:\/\//i.test(p.image) ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy">` : '';
    return `<article class="card" data-property="${p.id}" data-liked="${p.state.liked ? 1 : 0}" data-rejected="${p.state.rejected ? 1 : 0}" data-viewing="${p.state.viewing ? 1 : 0}">
<${link ? `a href="${link}" target="_blank" rel="noopener"` : 'div'} class="ph">${img}</${link ? 'a' : 'div'}>
<div class="body"><p class="title">${escapeHtml(p.title || p.reference)}</p>
<p class="meta">${escapeHtml([p.reference, p.place, p.facts].filter(Boolean).join(' · '))}</p>
<p class="price">${escapeHtml(p.price)}</p>
${link ? `<a class="view" href="${link}" target="_blank" rel="noopener">${escapeHtml(L('buyer_page_view'))} →</a>` : ''}
${p.state.rejected && p.state.rejectReason ? `<p class="reason">“${escapeHtml(p.state.rejectReason)}”</p>` : '<p class="reason" hidden></p>'}
<div class="acts">
<button type="button" class="yes${p.state.liked ? ' on' : ''}" data-action="like">${escapeHtml(p.state.liked ? L('buyer_page_liked') : L('buyer_page_like'))}</button>
<button type="button" class="no${p.state.rejected ? ' on' : ''}" data-action="reject">${escapeHtml(p.state.rejected ? L('buyer_page_rejected') : L('buyer_page_reject'))}</button>
<button type="button" class="vw${p.state.viewing ? ' on' : ''}" data-action="viewing"${p.state.viewing ? ' disabled' : ''}>${escapeHtml(p.state.viewing ? L('buyer_page_viewing_requested') : L('buyer_page_viewing'))}</button>
</div>
<div class="box" data-box="reject"><textarea maxlength="255" placeholder="${escapeHtml(L('buyer_page_reason_placeholder'))}"></textarea><div class="row"><button type="button" class="cancel">${escapeHtml(L('buyer_page_cancel'))}</button><button type="button" class="send">${escapeHtml(L('buyer_page_send'))}</button></div></div>
<div class="box" data-box="viewing"><textarea maxlength="1000" placeholder="${escapeHtml(L('buyer_page_viewing_message'))}"></textarea><div class="row"><button type="button" class="cancel">${escapeHtml(L('buyer_page_cancel'))}</button><button type="button" class="send">${escapeHtml(L('buyer_page_send'))}</button></div></div>
</div></article>`;
  }).join('\n');

  const agent = view.agent && (view.agent.name || view.agent.email)
    ? `<div class="agent"><strong>${escapeHtml(L('buyer_page_agent'))}:</strong> ${escapeHtml(view.agent.name || '')}${view.agent.email ? ` · <a href="mailto:${escapeHtml(view.agent.email)}">${escapeHtml(view.agent.email)}</a>` : ''}${view.agent.phone ? ` · <a href="tel:${escapeHtml(view.agent.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(view.agent.phone)}</a>` : ''}</div>`
    : '';

  // Words the script needs, as JSON (escaped for a <script> block).
  const words = JSON.stringify({
    like: L('buyer_page_like'), liked: L('buyer_page_liked'), reject: L('buyer_page_reject'), rejected: L('buyer_page_rejected'),
    viewing: L('buyer_page_viewing'), viewingRequested: L('buyer_page_viewing_requested'), saved: L('buyer_page_saved'), error: L('buyer_page_error'),
    url: opts.feedbackUrl,
  }).replace(/</g, '\\u003c');

  return `${head(view.lang, `${L('buyer_page_title')} · ${view.agency.name}`, color)}<body><div class="wrap">
<header>${brand}</header>
<h1>${escapeHtml(L('buyer_page_title'))}</h1>
<p class="intro">${escapeHtml(intro)}</p>
${view.properties.length ? `<div class="grid">${cards}</div>` : `<div class="empty">${escapeHtml(L('buyer_page_empty'))}</div>`}
${agent}
</div><div class="msg" role="status"></div>
<script>(function(){var W=${words};var msg=document.querySelector('.msg');var t;
function say(s){msg.textContent=s;msg.style.display='block';clearTimeout(t);t=setTimeout(function(){msg.style.display='none'},3500)}
function send(card,action,text){var body={propertyId:+card.dataset.property,action:action};if(action==='reject')body.reason=text||undefined;if(action==='viewing')body.message=text||undefined;
return fetch(W.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){if(!r.ok)throw 0;paint(card,action,text);say(W.saved)}).catch(function(){say(W.error)})}
function paint(card,action,text){var y=card.querySelector('.yes'),n=card.querySelector('.no'),v=card.querySelector('.vw'),r=card.querySelector('.reason');
if(action==='like'){card.dataset.liked='1';card.dataset.rejected='0'}if(action==='reject'){card.dataset.rejected='1';card.dataset.liked='0'}if(action==='clear'){card.dataset.liked='0';card.dataset.rejected='0'}
if(action==='viewing'){card.dataset.viewing='1';card.dataset.rejected='0';v.classList.add('on');v.textContent=W.viewingRequested;v.disabled=true}
var l=card.dataset.liked==='1',x=card.dataset.rejected==='1';y.classList.toggle('on',l);y.textContent=l?W.liked:W.like;n.classList.toggle('on',x);n.textContent=x?W.rejected:W.reject;
if(action==='reject'&&text){r.textContent='\\u201c'+text+'\\u201d';r.hidden=false}else if(!x){r.hidden=true}}
document.querySelectorAll('.card').forEach(function(card){var boxes={reject:card.querySelector('[data-box=reject]'),viewing:card.querySelector('[data-box=viewing]')};
function close(){boxes.reject.classList.remove('open');boxes.viewing.classList.remove('open')}
card.querySelectorAll('.acts button').forEach(function(b){b.addEventListener('click',function(){var a=b.dataset.action;close();
if(a==='like'){send(card,card.dataset.liked==='1'?'clear':'like');return}
if(a==='reject'){if(card.dataset.rejected==='1'){send(card,'clear');return}boxes.reject.classList.add('open');boxes.reject.querySelector('textarea').focus();return}
if(a==='viewing'){boxes.viewing.classList.add('open');boxes.viewing.querySelector('textarea').focus()}})});
['reject','viewing'].forEach(function(k){var box=boxes[k];box.querySelector('.cancel').addEventListener('click',close);box.querySelector('.send').addEventListener('click',function(){var v=box.querySelector('textarea').value.trim();close();send(card,k,v)})})})})();</script>
</body></html>`;
}
