import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { actions } from '@/core/actions';
import { getDataLoader } from '@/core/data-loader';
import { startRecording, voiceSupported, type Recording } from '@/core/voice-recorder';
import type { SearchFilters } from '@/types';

/**
 * "Describe your dream property" — a sentence instead of a form.
 *
 * The button only appears when the client has switched the feature on AND has
 * their own OpenRouter key: every search spends their credit, so a site with
 * no key simply doesn't offer it (the status call answers both questions in
 * one, before anything is shown).
 *
 * The mic button records a spoken search; the recording goes to the same
 * client-paid AI, which hears it against the site's own places and types.
 *
 * The panel covers the search block rather than hiding its fields one by one,
 * which keeps it working whatever shape the chosen search template is.
 */
export default function RsAiSearch() {
  const { t } = useLabels();
  const config = useConfig();
  const [available, setAvailable] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [voice, setVoice] = useState<'idle' | 'listening' | 'understanding'>('idle');
  const recordingRef = useRef<Recording | null>(null);
  // Switched on for this site in Super Admin, and a browser that can record.
  const canSpeak = voiceOn && voiceSupported();
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!config.aiSearchEnabled) return;
    let alive = true;
    const loader = getDataLoader();
    if (!loader) return;
    loader.aiSearchStatus().then((s) => {
      if (!alive) return;
      setAvailable(s.enabled);
      setVoiceOn(s.voice);
    });
    return () => { alive = false; };
  }, [config.aiSearchEnabled]);

  useEffect(() => {
    if (open) boxRef.current?.focus();
    // Closing the panel mid-recording must release the microphone.
    else recordingRef.current?.cancel();
  }, [open]);

  useEffect(() => () => recordingRef.current?.cancel(), []);

  const examples = [
    t('ai_search_example_1', 'modern apartment with sea views'),
    t('ai_search_example_2', 'family villa with garden under 400k'),
    t('ai_search_example_3', '2 bedroom rental near the beach'),
  ];

  // Shared by typing and speaking.
  const apply = useCallback((result: { filters?: Record<string, unknown>; interpretation?: string }) => {
    const filters = (result?.filters ?? {}) as SearchFilters;
    if (!Object.keys(filters).length) {
      setError(t('ai_search_nothing', 'That did not match anything we can search by. Try naming a place, a price or a number of bedrooms.'));
      return;
    }
    setSaid(result.interpretation || null);
    // Replace rather than merge: the sentence is the whole search, and
    // leftovers from the form would quietly narrow it further.
    actions.setFilters({ ...filters, page: 1 });
    window.RealtySoft?.search(undefined, { navigate: true });
    setOpen(false);
  }, [t]);

  const speak = useCallback(async () => {
    // A second tap while listening means "I'm done".
    if (voice === 'listening') { recordingRef.current?.stop(); return; }
    if (voice !== 'idle' || busy) return;
    const loader = getDataLoader();
    if (!loader) return;

    setError(null);
    setSaid(null);
    let recording: Recording;
    try {
      recording = await startRecording();
    } catch {
      setError(t('ai_voice_denied', 'The microphone could not be used. Allow it in your browser, or type your search instead.'));
      return;
    }
    recordingRef.current = recording;
    setVoice('listening');
    try {
      const audio = await recording.done;
      setVoice('understanding');
      const result = await loader.aiVoiceSearch(audio, config.language || 'en');
      if (result?.heard) setQuery(result.heard);
      apply(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message !== 'cancelled') {
        setError(message || t('ai_voice_error', 'That could not be understood. Please try again or type your search.'));
      }
    } finally {
      recordingRef.current = null;
      setVoice('idle');
    }
  }, [voice, busy, config.language, t, apply]);

  const run = useCallback(async () => {
    const text = query.trim();
    if (!text || busy) return;
    const loader = getDataLoader();
    if (!loader) return;

    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      apply(await loader.aiSearch(text, config.language || 'en'));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message || t('ai_search_error', 'That search could not be understood. Please try again.'));
    } finally {
      setBusy(false);
    }
  }, [query, busy, config.language, t, apply]);

  if (!available) return null;

  return (
    <div class="rs-ai">
      <button
        type="button"
        class={`rs-ai__badge${open ? ' rs-ai__badge--open' : ''}`}
        onClick={() => setOpen(!open)}
        title={t('ai_search_title', 'Search with AI')}
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z" />
          <path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" opacity="0.7" />
        </svg>
        <span class="rs-ai__badge-text">{t('ai_search_badge', 'AI')}</span>
      </button>

      {open && (
        <div class="rs-ai__panel" role="dialog" aria-label={t('ai_search_title', 'AI Search')}>
          <div class="rs-ai__head">
            <h3 class="rs-ai__title">{t('ai_search_title', 'AI Search')}</h3>
            <button type="button" class="rs-ai__back" onClick={() => setOpen(false)}>
              {t('ai_search_back', 'Back to filters')}
            </button>
          </div>

          <textarea
            ref={boxRef}
            class="rs-ai__input"
            rows={3}
            maxLength={400}
            placeholder={t('ai_search_placeholder', 'Describe your dream property…')}
            value={query}
            disabled={busy || voice !== 'idle'}
            onInput={(e) => setQuery((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void run(); }
            }}
          />

          {error && <p class="rs-ai__error">{error}</p>}
          {said && <p class="rs-ai__said">{said}</p>}

          <div class="rs-ai__actions">
            {canSpeak && (
              <button
                type="button"
                class={`rs-ai__mic rs-ai__mic--${voice}`}
                onClick={() => void speak()}
                disabled={busy || voice === 'understanding'}
                aria-pressed={voice === 'listening'}
                title={t('ai_voice_start', 'Speak your search')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
                </svg>
                <span class="rs-ai__mic-text">
                  {voice === 'listening'
                    ? t('ai_voice_listening', 'Listening… tap to stop')
                    : voice === 'understanding'
                      ? t('ai_voice_understanding', 'Understanding…')
                      : t('ai_voice_start', 'Speak your search')}
                </span>
              </button>
            )}
            <button type="button" class="rs-ai__go rs-search-btn" onClick={() => void run()} disabled={busy || voice !== 'idle' || !query.trim()}>
              {busy ? t('ai_search_thinking', 'Reading…') : t('search_button', 'Search')}
            </button>
          </div>

          <div class="rs-ai__examples">
            <span class="rs-ai__examples-label">{t('ai_search_try', 'Try:')}</span>
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                class="rs-ai__chip"
                onClick={() => { setQuery(example); boxRef.current?.focus(); }}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
