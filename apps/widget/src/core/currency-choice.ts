// The currency a visitor picked in the currency dropdown, kept in the browser
// so it stays when they move to another page or run a new search. Storage can
// be blocked or throw; then the site currency is simply shown again.

const KEY = 'spm:currency';

export function loadCurrencyChoice(): string | null {
  try {
    const code = localStorage.getItem(KEY);
    return code && /^[A-Z]{3}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

export function saveCurrencyChoice(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch { /* blocked: the choice lasts for this page only */ }
}
