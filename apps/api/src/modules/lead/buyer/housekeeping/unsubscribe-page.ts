import { escapeHtml } from '../../../../common/security/escape-html';

// The page behind the "Unsubscribe" link of buyer emails. Opening the link
// changes nothing (mail scanners open links); the buyer presses a button,
// which POSTs back to the same address. Pure.

type Texts = { ask: string; button: string; done: string; again: string; back: string; title: string };

const T: Record<string, Texts> = {
  en: { title: 'Property emails', ask: 'Stop receiving property emails from {agency}?', button: 'Unsubscribe', done: "You won't receive property emails from {agency} any more.", again: 'Subscribe again', back: 'You will receive property emails from {agency} again.' },
  es: { title: 'Emails de propiedades', ask: '¿Dejar de recibir emails de propiedades de {agency}?', button: 'Darme de baja', done: 'Ya no recibirá emails de propiedades de {agency}.', again: 'Volver a suscribirme', back: 'Volverá a recibir emails de propiedades de {agency}.' },
  nl: { title: 'Woning-e-mails', ask: 'Geen woning-e-mails meer ontvangen van {agency}?', button: 'Afmelden', done: 'U ontvangt geen woning-e-mails meer van {agency}.', again: 'Opnieuw aanmelden', back: 'U ontvangt weer woning-e-mails van {agency}.' },
  de: { title: 'Immobilien-E-Mails', ask: 'Keine Immobilien-E-Mails mehr von {agency} erhalten?', button: 'Abmelden', done: 'Sie erhalten keine Immobilien-E-Mails mehr von {agency}.', again: 'Wieder anmelden', back: 'Sie erhalten wieder Immobilien-E-Mails von {agency}.' },
  fr: { title: 'E-mails immobiliers', ask: "Ne plus recevoir d'e-mails immobiliers de {agency} ?", button: 'Me désabonner', done: "Vous ne recevrez plus d'e-mails immobiliers de {agency}.", again: "Me réabonner", back: "Vous recevrez à nouveau les e-mails immobiliers de {agency}." },
};

export function unsubscribePage(args: { agency: string; color: string; lang: string; state: 'ask' | 'unsubscribed' | 'subscribed' }): string {
  const t = T[args.lang] ?? T.en;
  const fill = (s: string) => escapeHtml(s.replace('{agency}', args.agency));
  const color = /^#[0-9a-f]{6}$/i.test(args.color) ? args.color : '#1e293b';
  const button = (action: 'unsubscribe' | 'subscribe', label: string) =>
    `<form method="post"><input type="hidden" name="action" value="${action}"><button type="submit" style="background:${color};color:#fff;border:0;border-radius:6px;padding:12px 22px;font-size:15px;font-weight:600;cursor:pointer">${escapeHtml(label)}</button></form>`;
  const body =
    args.state === 'ask'
      ? `<p>${fill(t.ask)}</p>${button('unsubscribe', t.button)}`
      : args.state === 'unsubscribed'
        ? `<p>${fill(t.done)}</p>${button('subscribe', t.again)}`
        : `<p>${fill(t.back)}</p>`;
  return `<!doctype html><html lang="${escapeHtml(args.lang)}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(t.title)} · ${escapeHtml(args.agency)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;color:#334155;text-align:center"><h1 style="font-size:20px;color:${color}">${escapeHtml(args.agency)}</h1>${body}</body></html>`;
}
