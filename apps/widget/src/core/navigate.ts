/**
 * Every page change the widget makes (a card, Back to results, a search sent
 * to the results page, a chat link). A single-page app can take it over: its
 * listener cancels the `spm:navigate` event and routes there itself (Next.js
 * router.push — no full reload). Otherwise the browser loads the page.
 */
export function navigateTo(url: string): void {
  const notHandled = document.dispatchEvent(
    new CustomEvent('spm:navigate', { detail: { url }, cancelable: true }),
  );
  if (notHandled) window.location.href = url;
}
