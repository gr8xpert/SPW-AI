import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useConfig } from './useConfig';

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void }) => number;
      reset: (widgetId: number) => void;
    };
  }
}

/**
 * The reCAPTCHA checkbox of a website form, when the client set a key pair in
 * the dashboard (the API only sends a valid site key). Put `ref` on an empty
 * div; send `token` with the form; the form is ready when `ready` is true.
 */
export function useRecaptcha() {
  const config = useConfig();
  const siteKey = (config as { recaptchaSiteKey?: string }).recaptchaSiteKey || undefined;
  const [token, setToken] = useState<string | null>(null);
  // A callback ref: the box can appear after the first render (the inquiry
  // form waits for its property), and the captcha is drawn when it does.
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const widgetId = useRef<number | null>(null);

  useEffect(() => {
    if (!siteKey || !el) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || widgetId.current != null) return;
      if (!window.grecaptcha?.render) {
        setTimeout(render, 200);
        return;
      }
      window.grecaptcha.ready(() => {
        if (cancelled || widgetId.current != null) return;
        widgetId.current = window.grecaptcha!.render(el, {
          sitekey: siteKey,
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(null),
        });
      });
    };
    // One copy of Google's script per page, whichever form asks first.
    if (!document.querySelector('script[src*="recaptcha/api.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    render();
    return () => {
      cancelled = true;
      // A new box (the form was redrawn) gets its own captcha.
      widgetId.current = null;
      setToken(null);
    };
  }, [siteKey, el]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current != null && window.grecaptcha) window.grecaptcha.reset(widgetId.current);
  }, []);

  return { siteKey, token, ref, reset, ready: !siteKey || !!token };
}
