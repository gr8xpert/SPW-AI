import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { actions } from '@/core/actions';
import { getDataLoader } from '@/core/data-loader';
import { startRecording, voiceSupported, type Recording } from '@/core/voice-recorder';
import { getAiState, loadAiStatus, onOpenAi, setVoiceState, useAiState, type AiMode } from '@/core/ai-search-state';
import { MicIcon, SparkleIcon } from '@/components/search/RsAiActions';
import type { SearchFilters } from '@/types';

interface Props {
  // The floating AI/mic buttons, for pages that place this component on its
  // own. The search templates put RsAiActions beside Reset instead.
  badge?: boolean;
  [key: string]: unknown;
}

const TOAST_MS = 7000;

/**
 * "Describe your dream property" — a sentence, typed or spoken, instead of a form.
 *
 * Only offered when the client has switched it on AND has their own OpenRouter
 * key: every search spends their credit (the status call answers both). Voice
 * has its own switch in Super Admin.
 *
 * The panel covers the search block rather than hiding its fields one by one,
 * which keeps it working whatever shape the chosen search template is. It
 * opens for typing, or — from the mic button — straight into listening.
 */
export default function RsAiSearch({ badge = true }: Props) {
  const { t } = useLabels();
  const config = useConfig();
  const ai = useAiState();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AiMode>('text');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ voice: boolean; text: string } | null>(null);
  const voice = ai.voiceState;
  const recordingRef = useRef<Recording | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Switched on for this site in Super Admin, and a browser that can record.
  const canSpeak = ai.voice && voiceSupported();

  useEffect(() => loadAiStatus(!!config.aiSearchEnabled), [config.aiSearchEnabled]);

  useEffect(() => {
    if (open && mode === 'text') boxRef.current?.focus();
    // Closing the panel mid-recording must release the microphone.
    if (!open) recordingRef.current?.cancel();
  }, [open, mode]);

  useEffect(() => () => recordingRef.current?.cancel(), []);

  // Mark the search template while the panel is open: CSS then hides the
  // filters and lets the panel take their place, so the section grows with it
  // instead of the panel spilling over the listings below.
  useEffect(() => {
    const host = rootRef.current?.parentElement;
    if (!host) return;
    host.classList.toggle('rs-ai-open', open);
    return () => host.classList.remove('rs-ai-open');
  }, [open, ai.enabled]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const examples = [
    t('ai_search_example_1', 'modern apartment with sea views'),
    t('ai_search_example_2', 'family villa with garden under 400k'),
    t('ai_search_example_3', '2 bedroom rental near the beach'),
  ];

  // Shared by typing and speaking. Returns whether a search was run.
  const apply = useCallback((result: { filters?: Record<string, unknown>; interpretation?: string; heard?: string }, spoken: boolean) => {
    const filters = (result?.filters ?? {}) as SearchFilters;
    if (!Object.keys(filters).length) {
      setError(spoken
        ? t('ai_voice_nothing', 'We couldn’t pick out a search from that. Try saying a place, a price or a number of bedrooms.')
        : t('ai_search_nothing', 'That did not match anything we can search by. Try naming a place, a price or a number of bedrooms.'));
      return false;
    }
    // Replace rather than merge: the sentence is the whole search, and
    // leftovers from the form would quietly narrow it further.
    actions.setFilters({ ...filters, page: 1 });
    window.RealtySoft?.search(undefined, { navigate: true });
    setOpen(false);
    // Say what was understood, so the visitor knows why these results.
    const text = (spoken ? result.heard : null) || result.interpretation;
    if (text) setToast({ voice: spoken, text });
    return true;
  }, [t]);

  const speak = useCallback(async () => {
    // A second tap while listening means "I'm done".
    if (recordingRef.current) { recordingRef.current.stop(); return; }
    // One recording on the page at a time, whichever panel started it (read
    // live: a stale render could let two start together).
    if (getAiState().voiceState !== 'idle' || busy) return;
    setVoiceState('listening');
    const loader = getDataLoader();
    if (!loader) return;

    setError(null);
    setToast(null);
    let recording: Recording;
    try {
      recording = await startRecording();
    } catch {
      setError(t('ai_voice_denied', 'The microphone could not be used. Allow it in your browser, or type your search instead.'));
      setVoiceState('idle');
      return;
    }
    recordingRef.current = recording;
    try {
      const audio = await recording.done;
      setVoiceState('understanding');
      const result = await loader.aiVoiceSearch(audio, config.language || 'en');
      if (result?.heard) setQuery(result.heard);
      apply(result, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message !== 'cancelled') {
        setError(message || t('ai_voice_error', 'That could not be understood. Please try again or type your search.'));
      }
    } finally {
      recordingRef.current = null;
      setVoiceState('idle');
    }
  }, [busy, config.language, t, apply]);

  // The buttons in the search bar (RsAiActions) open the panel through here.
  const speakRef = useRef(speak);
  speakRef.current = speak;
  useEffect(() => onOpenAi((next) => {
    setMode(next);
    setOpen(true);
    if (next === 'voice') void speakRef.current();
  }, () => rootRef.current?.closest('[data-spm-widget]') ?? null), []);

  const run = useCallback(async () => {
    const text = query.trim();
    if (!text || busy) return;
    const loader = getDataLoader();
    if (!loader) return;

    setBusy(true);
    setError(null);
    setToast(null);
    try {
      apply(await loader.aiSearch(text, config.language || 'en'), false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message || t('ai_search_error', 'That search could not be understood. Please try again.'));
    } finally {
      setBusy(false);
    }
  }, [query, busy, config.language, t, apply]);

  const switchTo = (next: AiMode) => {
    if (next === 'text') recordingRef.current?.cancel();
    setError(null);
    setMode(next);
    if (next === 'voice') void speak();
  };

  if (!ai.enabled) return null;

  const voiceStatus = voice === 'listening'
    ? t('ai_voice_listening_now', 'Listening… speak now')
    : voice === 'understanding'
      ? t('ai_voice_understanding', 'Understanding…')
      : error
        ? t('ai_voice_try_again', 'Tap the mic to try again')
        : t('ai_voice_tap', 'Tap the mic and say what you are looking for');

  return (
    <div class="rs-ai" ref={rootRef}>
      {badge && (
        <div class="rs-ai__badges">
          <button
            type="button"
            class={`rs-ai__badge${open ? ' rs-ai__badge--open' : ''}`}
            onClick={() => (open ? setOpen(false) : switchOpen('text'))}
            title={t('ai_search_title', 'Search with AI')}
            aria-expanded={open}
          >
            <SparkleIcon />
            <span class="rs-ai__badge-text">{t('ai_search_badge', 'AI')}</span>
          </button>
          {canSpeak && (
            <button
              type="button"
              class={`rs-ai__badge rs-ai__badge--mic${voice === 'listening' ? ' rs-ai__badge--listening' : ''}`}
              onClick={() => switchOpen('voice')}
              title={t('ai_voice_start', 'Speak your search')}
              aria-label={t('ai_voice_start', 'Speak your search')}
            >
              <MicIcon />
            </button>
          )}
        </div>
      )}

      {open && (
        <div class={`rs-ai__panel rs-ai__panel--${mode}`} role="dialog" aria-label={t('ai_search_title', 'AI Search')}>
          <div class="rs-ai__head">
            <h3 class="rs-ai__title">
              {mode === 'voice' ? t('ai_voice_title', 'Voice Search') : t('ai_search_title', 'AI Search')}
            </h3>
            <button type="button" class="rs-ai__back" onClick={() => setOpen(false)}>
              {t('ai_search_back', 'Back to filters')}
            </button>
          </div>

          {mode === 'voice' ? (
            <div class="rs-ai__voice">
              <button
                type="button"
                class={`rs-ai__voice-mic rs-ai__voice-mic--${voice}`}
                onClick={() => void speak()}
                disabled={voice === 'understanding'}
                aria-pressed={voice === 'listening'}
                aria-label={voice === 'listening' ? t('ai_voice_stop', 'Stop listening') : t('ai_voice_start', 'Speak your search')}
              >
                {voice === 'understanding' ? <span class="rs-ai__spinner" aria-hidden="true" /> : <MicIcon size={30} />}
              </button>
              <p class="rs-ai__voice-status" aria-live="polite">{voiceStatus}</p>
              {error && <p class="rs-ai__error">{error}</p>}
              <p class="rs-ai__voice-hint">
                {t('ai_voice_example', 'For example: “3 bedroom villa with a pool under 500,000”')}
              </p>
              <div class="rs-ai__voice-actions">
                {voice === 'listening' && (
                  <button type="button" class="rs-ai__link" onClick={() => recordingRef.current?.stop()}>
                    {t('ai_voice_done', 'Done speaking')}
                  </button>
                )}
                <button type="button" class="rs-ai__link" onClick={() => switchTo('text')}>
                  {t('ai_voice_type_instead', 'Type instead')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <textarea
                ref={boxRef}
                class="rs-ai__input"
                rows={3}
                maxLength={400}
                placeholder={t('ai_search_placeholder', 'Describe your dream property…')}
                value={query}
                disabled={busy}
                onInput={(e) => setQuery((e.target as HTMLTextAreaElement).value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void run(); }
                }}
              />

              {error && <p class="rs-ai__error">{error}</p>}

              <div class="rs-ai__actions">
                {canSpeak && (
                  <button type="button" class="rs-ai__mic" onClick={() => switchTo('voice')} disabled={busy}>
                    <MicIcon size={18} />
                    <span class="rs-ai__mic-text">{t('ai_voice_start', 'Speak your search')}</span>
                  </button>
                )}
                <button type="button" class="rs-ai__go rs-search-btn" onClick={() => void run()} disabled={busy || !query.trim()}>
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
            </>
          )}
        </div>
      )}

      {toast && (
        <div class="rs-ai__toast" role="status">
          <span class="rs-ai__toast-icon">{toast.voice ? <MicIcon size={15} /> : <SparkleIcon size={15} />}</span>
          <span class="rs-ai__toast-text">
            {toast.voice ? `“${toast.text}”` : toast.text}
          </span>
          <button type="button" class="rs-ai__toast-close" onClick={() => setToast(null)} aria-label={t('close', 'Close')}>×</button>
        </div>
      )}
    </div>
  );

  function switchOpen(next: AiMode) {
    setMode(next);
    setOpen(true);
    setError(null);
    if (next === 'voice') void speak();
  }
}
