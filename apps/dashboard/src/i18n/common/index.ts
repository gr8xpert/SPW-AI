'use client';

import { useText } from '../i18n-provider';
import type { Dictionaries } from '../languages';
import { en, type CommonText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

const common: Dictionaries<CommonText> = { en, nl, es, fr, de, fi, sv };

export function useCommonText(): CommonText {
  return useText(common);
}
