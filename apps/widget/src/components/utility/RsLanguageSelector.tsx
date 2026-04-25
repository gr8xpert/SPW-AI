import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';

interface Props {
  languages?: { code: string; label: string }[];
  onChange?: (code: string) => void;
  [key: string]: unknown;
}

const DEFAULT_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Espanol' },
  { code: 'fr', label: 'Francais' },
  { code: 'de', label: 'Deutsch' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pt', label: 'Portugues' },
  { code: 'ru', label: 'Russian' },
];

export default function RsLanguageSelector({ languages, onChange }: Props) {
  const { t } = useLabels();
  const config = useConfig();
  const currentLang = config.language ?? 'en';
  const availableLanguages = languages ?? DEFAULT_LANGUAGES;

  const handleChange = useCallback(
    (e: Event) => {
      const code = (e.target as HTMLSelectElement).value;
      onChange?.(code);
    },
    [onChange],
  );

  return (
    <div class="rs-selector">
      <label class="rs-field__label">
        {t('language_label', 'Language')}
      </label>
      <select class="rs-select" value={currentLang} onChange={handleChange}>
        {availableLanguages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
