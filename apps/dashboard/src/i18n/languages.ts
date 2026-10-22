import { DASHBOARD_LANGUAGES, type DashboardLanguage } from '@spm/shared';

export { DASHBOARD_LANGUAGES, type DashboardLanguage };

// How each language names itself in the picker, and the locale used for
// dates and numbers.
export const LANGUAGE_INFO: Record<DashboardLanguage, { name: string; locale: string }> = {
  en: { name: 'English', locale: 'en-GB' },
  nl: { name: 'Nederlands', locale: 'nl-NL' },
  es: { name: 'Español', locale: 'es-ES' },
  fr: { name: 'Français', locale: 'fr-FR' },
  de: { name: 'Deutsch', locale: 'de-DE' },
  fi: { name: 'Suomi', locale: 'fi-FI' },
  sv: { name: 'Svenska', locale: 'sv-SE' },
};

export function toDashboardLanguage(value: unknown): DashboardLanguage {
  return (DASHBOARD_LANGUAGES as readonly unknown[]).includes(value) ? (value as DashboardLanguage) : 'en';
}

/**
 * One dictionary per language for a part of the dashboard. Every language is
 * required, and each must have exactly the keys of the English one, so a
 * missing word fails the build instead of showing up blank.
 */
export type Dictionaries<T> = Record<DashboardLanguage, T>;
