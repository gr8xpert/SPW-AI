import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';
import { buildPropertyUrl } from '@/core/url-utils';
import type { Property } from '@/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  properties?: Property[];
  timestamp: number;
}

export default function RsChatPanel() {
  const { t } = useLabels();
  const config = useConfig();
  const { formatPrice } = useCurrency();
  const ui = useSelector(selectors.getUI);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (ui.chatOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [ui.chatOpen]);

  const handleClose = useCallback(() => {
    actions.mergeUI({ chatOpen: false });
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsSending(true);

    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      abortRef.current = new AbortController();
      const chatUrl = `${config.apiUrl}/api/v1/chat`;
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error('Chat request failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';
      let inlineProperties: Property[] | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
              }
              if (parsed.properties) {
                inlineProperties = parsed.properties;
              }
            } catch {
              // Non-JSON SSE data treated as plain text
              fullContent += data;
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: fullContent, properties: inlineProperties }
              : m,
          ),
        );
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: t('chat_error', 'Sorry, something went wrong. Please try again.') }
              : m,
          ),
        );
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  }, [input, isSending, messages, config.apiUrl, t]);

  const handleSubmit = useCallback(
    (e: Event) => {
      e.preventDefault();
      sendMessage();
    },
    [sendMessage],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const handlePropertyClick = useCallback(
    (property: Property) => {
      if (config.onPropertyClick) {
        config.onPropertyClick(property);
      } else {
        const url = buildPropertyUrl(property, config);
        if (url) window.location.href = url;
      }
    },
    [config],
  );

  if (!ui.chatOpen) return null;

  return (
    <div class="rs-chat-panel rs-slide-up">
      <div class="rs-chat-panel__header">
        <span class="rs-chat-panel__title">
          {t('chat_title', 'Property Assistant')}
        </span>
        <button
          type="button"
          class="rs-chat-panel__close"
          onClick={handleClose}
          aria-label={t('close', 'Close')}
        >
          &times;
        </button>
      </div>

      <div class="rs-chat-messages">
        {messages.length === 0 && (
          <div class="rs-chat-messages__empty">
            {t('chat_welcome', 'Ask me anything about our properties!')}
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            class={`rs-chat-message rs-chat-message--${msg.role}`}
          >
            <div class="rs-chat-message__content">
              {msg.content || (
                <span class="rs-chat-message__typing">
                  <span /><span /><span />
                </span>
              )}
            </div>

            {msg.properties && msg.properties.length > 0 && (
              <div class="rs-chat-message__properties">
                {msg.properties.map((prop) => (
                  <div
                    key={prop.id}
                    class="rs-chat-property-card"
                    onClick={() => handlePropertyClick(prop)}
                    role="article"
                  >
                    {prop.images.length > 0 && (
                      <img
                        class="rs-chat-property-card__image"
                        src={prop.images[0].thumbnailUrl || prop.images[0].url}
                        alt={prop.title}
                        loading="lazy"
                      />
                    )}
                    <div class="rs-chat-property-card__body">
                      <div class="rs-chat-property-card__price">
                        {prop.priceOnRequest
                          ? t('price_on_request', 'Price on Request')
                          : formatPrice(prop.price, prop.currency)}
                      </div>
                      <div class="rs-chat-property-card__title">{prop.title}</div>
                      <div class="rs-chat-property-card__location">{prop.location.name}</div>
                    </div>
                  </div>
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
          placeholder={t('chat_placeholder', 'Type your question...')}
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          disabled={isSending}
        />
        <button
          type="submit"
          class="rs-search-btn"
          disabled={isSending || !input.trim()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
