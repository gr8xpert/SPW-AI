import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';
import { buildPropertyUrl } from '@/core/url-utils';
import { navigateTo } from '@/core/navigate';
import { createChatStreamParser, chatProperties, type ChatProperty } from '@/core/chat-stream';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  properties?: ChatProperty[];
  error?: boolean;
}

interface SavedChat {
  conversationId: number | null;
  token: string | null;
  messages: ChatMessage[];
}

const MAX_SAVED = 40;

// The chat survives page changes in this tab (sessionStorage); a new tab
// or a closed browser starts fresh.
function storageKey(apiKey: string): string {
  return `spm-chat:${apiKey.slice(-12)}`;
}

function loadChat(apiKey: string): SavedChat {
  try {
    const raw = sessionStorage.getItem(storageKey(apiKey));
    if (raw) {
      const saved = JSON.parse(raw) as SavedChat;
      if (Array.isArray(saved.messages)) return saved;
    }
  } catch {
    // Storage blocked: the chat just doesn't survive a page change.
  }
  return { conversationId: null, token: null, messages: [] };
}

function saveChat(apiKey: string, chat: SavedChat): void {
  try {
    sessionStorage.setItem(storageKey(apiKey), JSON.stringify({ ...chat, messages: chat.messages.slice(-MAX_SAVED) }));
  } catch {
    // ignore
  }
}

// **bold** and line breaks, as text nodes (never HTML from the model).
function renderText(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

export default function RsChatPanel() {
  const { t } = useLabels();
  const config = useConfig();
  const { formatPrice } = useCurrency();
  const ui = useSelector(selectors.getUI);
  const selected = useSelector(selectors.getSelectedProperty);
  const favorites = useSelector(selectors.getFavorites);

  const [chat, setChat] = useState<SavedChat>(() => loadChat(config.apiKey || ''));
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatRef = useRef(chat);
  chatRef.current = chat;

  const update = useCallback((fn: (c: SavedChat) => SavedChat) => {
    setChat((prev) => {
      const next = fn(prev);
      saveChat(config.apiKey || '', next);
      return next;
    });
  }, [config.apiKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.messages, ui.chatOpen]);

  useEffect(() => {
    if (ui.chatOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [ui.chatOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleClose = useCallback(() => {
    actions.mergeUI({ chatOpen: false });
  }, []);

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSending(false);
    update(() => ({ conversationId: null, token: null, messages: [] }));
  }, [update]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const stamp = Date.now();
    const assistantId = `assistant-${stamp}`;
    update((c) => ({
      ...c,
      messages: [
        ...c.messages,
        { id: `user-${stamp}`, role: 'user', content: text },
        { id: assistantId, role: 'assistant', content: '' },
      ],
    }));
    setInput('');
    setIsSending(true);

    const patchAssistant = (fn: (m: ChatMessage) => ChatMessage) =>
      update((c) => ({ ...c, messages: c.messages.map((m) => (m.id === assistantId ? fn(m) : m)) }));

    let gotAnswer = false;
    try {
      abortRef.current = new AbortController();
      const current = chatRef.current;
      const language = (config.language || document.documentElement.lang || '').slice(0, 2).toLowerCase();
      const response = await fetch(`${config.apiUrl}/api/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey || '' },
        body: JSON.stringify({
          message: text.slice(0, 2000),
          ...(current.conversationId && current.token
            ? { conversationId: current.conversationId, conversationToken: current.token }
            : {}),
          context: {
            ...(/^[a-z]{2}$/.test(language) ? { language } : {}),
            ...(selected?.reference ? { propertyReference: selected.reference } : {}),
            ...(favorites.length ? { favorites: favorites.slice(0, 50) } : {}),
          },
        }),
        signal: abortRef.current.signal,
      });

      if (response.status === 429) throw new Error('rate');
      if (!response.ok || !response.body) throw new Error('Chat request failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const outcome: { failure: string | null } = { failure: null };
      const parser = createChatStreamParser(({ type, data }) => {
        if (type === 'conversation' && typeof data.conversationId === 'number' && typeof data.token === 'string') {
          const conversationId = data.conversationId;
          const token = data.token;
          update((c) => ({ ...c, conversationId, token }));
        } else if (type === 'tool_result') {
          const props = chatProperties(data.properties);
          if (props.length) patchAssistant((m) => ({ ...m, properties: props }));
        } else if (type === 'delta' && typeof data.content === 'string') {
          gotAnswer = true;
          const chunk = data.content;
          patchAssistant((m) => ({ ...m, content: m.content + chunk }));
        } else if (type === 'error') {
          outcome.failure = data.code === 'LIMIT'
            ? t('chat_limit', 'This chat is full. Please start a new chat.')
            : t('chat_error', 'Sorry, something went wrong. Please try again.');
          // A chat the server no longer accepts is not continued.
          if (data.code === 'LIMIT') update((c) => ({ ...c, conversationId: null, token: null }));
        }
      });

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.end();

      if (outcome.failure) {
        const message = outcome.failure;
        patchAssistant((m) => ({ ...m, content: m.content || message, error: !m.content }));
      } else if (!gotAnswer) {
        throw new Error('empty');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const message = (err as Error).message === 'rate'
          ? t('chat_rate_limited', 'Too many messages. Please wait a moment.')
          : t('chat_error', 'Sorry, something went wrong. Please try again.');
        patchAssistant((m) => ({ ...m, content: m.content || message, error: !m.content }));
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  }, [input, isSending, config.apiUrl, config.apiKey, config.language, selected, favorites, update, t]);

  const handleSubmit = useCallback((e: Event) => {
    e.preventDefault();
    sendMessage();
  }, [sendMessage]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const urlFor = useCallback((p: ChatProperty) => buildPropertyUrl(
    {
      id: p.id,
      reference: p.reference,
      title: p.title || '',
      slug: p.slug ?? null,
      location: p.location ? { name: p.location } : null,
      propertyType: p.propertyType ? { name: p.propertyType } : null,
    },
    config,
  ), [config]);

  const handlePropertyClick = useCallback((e: MouseEvent, p: ChatProperty) => {
    const url = urlFor(p);
    if (!url) return;
    e.preventDefault();
    navigateTo(url);
  }, [urlFor]);

  if (!ui.chatOpen) return null;

  const welcome = config.aiChatWelcome || t('chat_welcome', 'Ask me anything about our properties!');

  return (
    <div class="rs-chat-panel rs-slide-up" role="dialog" aria-label={t('chat_title', 'Property Assistant')}>
      <div class="rs-chat-panel__header">
        <span class="rs-chat-panel__title">{t('chat_title', 'Property Assistant')}</span>
        <div class="rs-chat-panel__actions">
          {chat.messages.length > 0 && (
            <button
              type="button"
              class="rs-chat-panel__close"
              onClick={handleNewChat}
              aria-label={t('chat_new', 'New chat')}
              title={t('chat_new', 'New chat')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
          <button type="button" class="rs-chat-panel__close" onClick={handleClose} aria-label={t('close', 'Close')}>
            &times;
          </button>
        </div>
      </div>

      <div class="rs-chat-messages" aria-live="polite">
        {chat.messages.length === 0 && <div class="rs-chat-messages__empty">{welcome}</div>}

        {chat.messages.map((msg) => (
          <div key={msg.id} class={`rs-chat-message rs-chat-message--${msg.role}${msg.error ? ' rs-chat-message--error' : ''}`}>
            {(msg.content || msg.role === 'assistant') && (
              <div class="rs-chat-message__content">
                {msg.content ? renderText(msg.content) : (
                  <span class="rs-chat-message__typing"><span /><span /><span /></span>
                )}
              </div>
            )}

            {msg.properties && msg.properties.length > 0 && (
              <div class="rs-chat-message__properties">
                {msg.properties.map((prop) => (
                  <a
                    key={prop.id}
                    class="rs-chat-property-card"
                    href={urlFor(prop) || undefined}
                    onClick={(e) => handlePropertyClick(e as unknown as MouseEvent, prop)}
                  >
                    {prop.image && (
                      <img class="rs-chat-property-card__image" src={prop.image} alt="" loading="lazy" />
                    )}
                    <div class="rs-chat-property-card__body">
                      <div class="rs-chat-property-card__price">
                        {prop.priceOnRequest || !prop.price
                          ? t('price_on_request', 'Price on request')
                          : formatPrice(prop.price, prop.currency)}
                      </div>
                      <div class="rs-chat-property-card__title">{prop.title || prop.reference}</div>
                      <div class="rs-chat-property-card__location">
                        {[
                          prop.location,
                          prop.bedrooms ? `${prop.bedrooms} ${t('beds_short', 'bd')}` : '',
                          Number(prop.buildSize) ? `${Math.round(Number(prop.buildSize))} m²` : '',
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form class="rs-chat-input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          class="rs-input"
          maxLength={2000}
          placeholder={t('chat_placeholder', 'Type your question...')}
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          disabled={isSending}
          aria-label={t('chat_placeholder', 'Type your question...')}
        />
        <button
          type="submit"
          class="rs-search-btn"
          disabled={isSending || !input.trim()}
          aria-label={t('chat_send', 'Send')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
