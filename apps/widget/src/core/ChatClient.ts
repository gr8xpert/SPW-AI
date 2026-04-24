import { storage } from '../utils/helpers';

export interface ChatSSEEvent {
  type: 'conversation' | 'delta' | 'tool_call' | 'tool_result' | 'done' | 'error';
  data: any;
}

export interface ChatClientConfig {
  apiUrl: string;
  apiKey: string;
}

export class ChatClient {
  private config: ChatClientConfig;
  private conversationId: number | null = null;
  private storageKey: string;

  constructor(config: ChatClientConfig) {
    this.config = config;
    this.storageKey = `spw_chat_${config.apiKey.slice(-8)}`;
    this.conversationId = storage.get<number>(this.storageKey) || null;
  }

  getConversationId(): number | null {
    return this.conversationId;
  }

  resetConversation(): void {
    this.conversationId = null;
    storage.remove(this.storageKey);
  }

  async loadHistory(): Promise<any | null> {
    if (!this.conversationId) return null;
    try {
      const res = await fetch(`${this.config.apiUrl}/api/v1/chat/${this.conversationId}`, {
        headers: { 'x-api-key': this.config.apiKey },
      });
      if (!res.ok) {
        this.resetConversation();
        return null;
      }
      const data = await res.json();
      if (data.data) return data.data;
      return data;
    } catch {
      this.resetConversation();
      return null;
    }
  }

  async *sendMessage(
    message: string,
    context?: {
      propertyReference?: string;
      favorites?: number[];
      recentlyViewed?: string[];
      language?: string;
    },
  ): AsyncGenerator<ChatSSEEvent> {
    const body: any = {
      message,
      context,
    };
    if (this.conversationId) {
      body.conversationId = this.conversationId;
    }

    const res = await fetch(`${this.config.apiUrl}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Request failed');
      yield { type: 'error', data: { message: errText } };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: 'error', data: { message: 'Streaming not supported' } };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let eventType: string | null = null;

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ') && eventType) {
          try {
            const data = JSON.parse(line.slice(6));
            const event: ChatSSEEvent = { type: eventType as any, data };

            if (event.type === 'conversation' && data.conversationId) {
              this.conversationId = data.conversationId;
              storage.set(this.storageKey, data.conversationId);
            }

            yield event;
          } catch {
            // skip malformed JSON
          }
          eventType = null;
        } else if (line === '') {
          eventType = null;
        }
      }
    }
  }

  async emailTranscript(email: string): Promise<boolean> {
    if (!this.conversationId) return false;
    try {
      const res = await fetch(
        `${this.config.apiUrl}/api/v1/chat/${this.conversationId}/email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
          },
          body: JSON.stringify({ email }),
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
