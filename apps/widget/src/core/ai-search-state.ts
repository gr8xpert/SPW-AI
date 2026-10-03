import { useEffect, useReducer } from 'preact/hooks';
import { getDataLoader } from './data-loader';
import { store } from './store';

// Shared between the AI panel (RsAiSearch) and its buttons (RsAiActions),
// which sit elsewhere in the search bar — beside Reset, and again in the
// mobile action row — so they can't share component state.

export type AiMode = 'text' | 'voice';
export type VoiceState = 'idle' | 'listening' | 'understanding';

export interface AiState {
  /** AI search available: switched on and the client has their own key. */
  enabled: boolean;
  /** Voice switched on for this site in Super Admin. */
  voice: boolean;
  voiceState: VoiceState;
}

let state: AiState = { enabled: false, voice: false, voiceState: 'idle' };
const listeners = new Set<() => void>();
// Each AI panel with the search widget it belongs to, so a button opens only
// the panel of its own search bar — never every panel on the page (a page
// with two search bars would otherwise record, and bill, twice).
const openers = new Map<(mode: AiMode) => void, () => Element | null>();
let statusAsked = false;

function update(patch: Partial<AiState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

type Status = { enabled: boolean; voice: boolean };
function statusIn(config: { aiSearch?: Status }): Status | null {
  const s = config.aiSearch;
  return s && typeof s.enabled === 'boolean' ? { enabled: s.enabled, voice: s.enabled && !!s.voice } : null;
}

/** Finds out once per page whether to offer AI search and voice. */
export function loadAiStatus(enabledInConfig: boolean): void {
  if (!enabledInConfig || statusAsked) return;
  const loader = getDataLoader();
  if (!loader) return;
  statusAsked = true;
  // Newer APIs send it with the dashboard settings: follow those (a saved
  // copy first, then the live ones) instead of asking separately.
  const fromConfig = statusIn(store.getState().config);
  if (fromConfig) {
    update(fromConfig);
    store.subscribeSlice('config', (config) => {
      const s = statusIn(config);
      if (s && (s.enabled !== state.enabled || s.voice !== state.voice)) update(s);
    });
    return;
  }
  void loader.aiSearchStatus().then((s) => update({ enabled: s.enabled, voice: s.voice }));
}

export function setVoiceState(voiceState: VoiceState): void {
  update({ voiceState });
}

export function getAiState(): AiState {
  return state;
}

/**
 * A button asks the panel of its own search widget to open, for typing or
 * straight into listening. Falls back to the first panel when the button sits
 * outside any widget that has one.
 */
export function openAi(mode: AiMode, from?: Element | null): void {
  const widget = from?.closest('[data-spm-widget]') ?? null;
  let target: ((m: AiMode) => void) | undefined;
  for (const [open, rootOf] of openers) {
    if (widget && rootOf() === widget) { target = open; break; }
    target ??= open;
  }
  target?.(mode);
}

export function onOpenAi(open: (mode: AiMode) => void, rootOf: () => Element | null): () => void {
  openers.set(open, rootOf);
  return () => { openers.delete(open); };
}

export function useAiState(): AiState {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(rerender as () => void);
    return () => { listeners.delete(rerender as () => void); };
  }, []);
  return state;
}
