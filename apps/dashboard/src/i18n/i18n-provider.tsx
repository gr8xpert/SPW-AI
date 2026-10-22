'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useApi } from '@/hooks/use-api';
import { LANGUAGE_INFO, type DashboardLanguage, type Dictionaries } from './languages';

// The dashboard language of the signed-in user. The server layout passes the
// one stored in the session (saved on the user, returned at login), so the
// first render is already in the right language. Changing it saves it on the
// user and in the session, so it survives a refresh and the next login.

interface I18nState {
  language: DashboardLanguage;
  locale: string;
  setLanguage: (language: DashboardLanguage) => Promise<void>;
}

// The locale for date/number helpers that live outside components. Browser
// only: on the server one module is shared by every request, so there it
// stays undefined (= the runtime default), and lists that load their data in
// the browser render with the user's locale.
let browserLocale: string | undefined;
let browserLanguage: DashboardLanguage = 'en';

export function dashboardLocale(): string | undefined {
  return browserLocale;
}

/** The dashboard language, for helpers outside components (browser only). */
export function dashboardLanguage(): DashboardLanguage {
  return browserLanguage;
}

const I18nContext = createContext<I18nState>({
  language: 'en',
  locale: LANGUAGE_INFO.en.locale,
  setLanguage: async () => {},
});

export function I18nProvider({ initial, children }: { initial: DashboardLanguage; children: React.ReactNode }) {
  const [language, setState] = useState<DashboardLanguage>(initial);
  const api = useApi();
  const { update } = useSession();
  if (typeof window !== 'undefined') {
    browserLocale = LANGUAGE_INFO[language].locale;
    browserLanguage = language;
  }

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(
    async (next: DashboardLanguage) => {
      setState(next);
      // Saved on the user first (the next login), then in the session cookie
      // (this browser's next refresh). A failure is thrown to the picker.
      await api.put('/api/auth/me/language', { language: next });
      await update({ dashboardLanguage: next });
    },
    [api, update],
  );

  const value = useMemo(() => ({ language, locale: LANGUAGE_INFO[language].locale, setLanguage }), [language, setLanguage]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLanguage(): I18nState {
  return useContext(I18nContext);
}

/** The dictionary of the current language, for one part of the dashboard. */
export function useText<T>(dictionaries: Dictionaries<T>): T {
  const { language } = useLanguage();
  return dictionaries[language] ?? dictionaries.en;
}
