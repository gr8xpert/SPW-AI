import { useEffect } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { loadAiStatus, openAi, useAiState } from '@/core/ai-search-state';
import { voiceSupported } from '@/core/voice-recorder';

export function SparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z" />
      <path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" opacity="0.7" />
    </svg>
  );
}

export function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
    </svg>
  );
}

/**
 * The AI and voice buttons in the search bar, beside Reset: one tap opens
 * the AI box for typing, the other starts listening straight away. Each only
 * appears when it's switched on for the site (and the mic only where the
 * browser can record), so a site without AI shows nothing here.
 */
export default function RsAiActions() {
  const { t } = useLabels();
  const config = useConfig();
  const ai = useAiState();

  useEffect(() => loadAiStatus(!!config.aiSearchEnabled), [config.aiSearchEnabled]);

  if (!ai.enabled) return null;
  const canSpeak = ai.voice && voiceSupported();
  const listening = ai.voiceState === 'listening';

  return (
    <div class="rs_ai_actions">
      <button
        type="button"
        class="rs-reset-btn rs-reset-btn--icon rs-ai-btn"
        onClick={(e) => openAi('text', e.currentTarget as Element)}
        title={t('ai_search_title', 'Search with AI')}
        aria-label={t('ai_search_title', 'Search with AI')}
      >
        <SparkleIcon />
      </button>
      {canSpeak && (
        <button
          type="button"
          class={`rs-reset-btn rs-reset-btn--icon rs-ai-btn rs-ai-btn--mic${listening ? ' rs-ai-btn--listening' : ''}`}
          onClick={(e) => openAi('voice', e.currentTarget as Element)}
          title={listening ? t('ai_voice_stop', 'Stop listening') : t('ai_voice_start', 'Speak your search')}
          aria-label={listening ? t('ai_voice_stop', 'Stop listening') : t('ai_voice_start', 'Speak your search')}
          aria-pressed={listening}
        >
          <MicIcon />
        </button>
      )}
    </div>
  );
}
