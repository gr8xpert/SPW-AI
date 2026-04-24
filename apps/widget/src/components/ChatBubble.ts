import { ChatClient } from '../core/ChatClient';
import { ChatMessageComponent, ChatMessageData } from './ChatMessage';
import { ChatPropertyData } from './ChatPropertyCard';
import { escapeHtml } from '../utils/helpers';
import '../styles/chat.css';

export interface ChatBubbleConfig {
  apiUrl: string;
  apiKey: string;
  language?: string;
  welcomeMessage?: string;
  getFavorites?: () => number[];
  getRecentlyViewed?: () => string[];
  getCurrentPropertyReference?: () => string | undefined;
  onPropertyClick?: (reference: string) => void;
}

export class ChatBubble {
  private config: ChatBubbleConfig;
  private client: ChatClient;
  private container: HTMLElement;
  private isOpen = false;
  private isSending = false;
  private messages: ChatMessageData[] = [];
  private panel: HTMLElement | null = null;
  private messageList: HTMLElement | null = null;
  private input: HTMLTextAreaElement | null = null;
  private emailOverlay: HTMLElement | null = null;

  constructor(config: ChatBubbleConfig) {
    this.config = config;
    this.client = new ChatClient({ apiUrl: config.apiUrl, apiKey: config.apiKey });
    this.container = document.createElement('div');
    this.container.className = 'spw-chat-container';
    document.body.appendChild(this.container);
    this.renderBubble();
    this.loadExistingConversation();
  }

  private renderBubble(): void {
    const btn = document.createElement('button');
    btn.className = 'spw-chat-fab';
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    btn.addEventListener('click', () => this.toggle());
    this.container.appendChild(btn);
  }

  private toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    if (this.panel) {
      this.panel.style.display = 'flex';
    } else {
      this.renderPanel();
    }
    this.isOpen = true;
    this.container.classList.add('spw-chat-open');
    this.scrollToBottom();
    setTimeout(() => this.input?.focus(), 100);
  }

  private close(): void {
    if (this.panel) this.panel.style.display = 'none';
    this.isOpen = false;
    this.container.classList.remove('spw-chat-open');
  }

  private renderPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'spw-chat-panel';

    this.panel.innerHTML = `
      <div class="spw-chat-header">
        <span class="spw-chat-header-title">Property Assistant</span>
        <div class="spw-chat-header-actions">
          <button class="spw-chat-header-btn spw-chat-btn-new" title="New Chat">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button class="spw-chat-header-btn spw-chat-btn-email" title="Email Chat">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          </button>
          <button class="spw-chat-header-btn spw-chat-btn-close" title="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="spw-chat-messages"></div>
      <div class="spw-chat-email-overlay" style="display:none">
        <div class="spw-chat-email-form">
          <p>Enter your email to receive this chat transcript:</p>
          <input type="email" class="spw-chat-email-input" placeholder="your@email.com">
          <div class="spw-chat-email-actions">
            <button class="spw-chat-email-cancel">Cancel</button>
            <button class="spw-chat-email-send">Send</button>
          </div>
        </div>
      </div>
      <div class="spw-chat-input-area">
        <textarea class="spw-chat-input" placeholder="Ask about properties..." rows="1"></textarea>
        <button class="spw-chat-send" disabled>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    `;

    this.container.appendChild(this.panel);
    this.messageList = this.panel.querySelector('.spw-chat-messages')!;
    this.input = this.panel.querySelector('.spw-chat-input')!;
    this.emailOverlay = this.panel.querySelector('.spw-chat-email-overlay')!;

    const sendBtn = this.panel.querySelector('.spw-chat-send')!;
    this.input.addEventListener('input', () => {
      (sendBtn as HTMLButtonElement).disabled = !this.input!.value.trim() || this.isSending;
      this.autoResizeInput();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });
    sendBtn.addEventListener('click', () => this.handleSend());

    this.panel.querySelector('.spw-chat-btn-close')!.addEventListener('click', () => this.close());
    this.panel.querySelector('.spw-chat-btn-new')!.addEventListener('click', () => this.handleNewChat());
    this.panel.querySelector('.spw-chat-btn-email')!.addEventListener('click', () => this.showEmailOverlay());

    this.panel.querySelector('.spw-chat-email-cancel')!.addEventListener('click', () => this.hideEmailOverlay());
    this.panel.querySelector('.spw-chat-email-send')!.addEventListener('click', () => this.handleEmailSend());

    this.renderMessages();

    if (this.messages.length === 0 && this.config.welcomeMessage) {
      this.addMessage({ role: 'assistant', content: this.config.welcomeMessage });
    }
  }

  private async loadExistingConversation(): Promise<void> {
    const history = await this.client.loadHistory();
    if (!history?.messages?.length) return;

    for (const msg of history.messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        this.messages.push({ role: msg.role, content: msg.content });
      }
    }
    if (this.messageList) this.renderMessages();
  }

  private renderMessages(): void {
    if (!this.messageList) return;
    this.messageList.innerHTML = '';
    for (const msg of this.messages) {
      const component = new ChatMessageComponent(msg, this.config.onPropertyClick);
      this.messageList.appendChild(component.render());
    }
    this.scrollToBottom();
  }

  private addMessage(data: ChatMessageData): void {
    this.messages.push(data);
    if (this.messageList) {
      const component = new ChatMessageComponent(data, this.config.onPropertyClick);
      this.messageList.appendChild(component.render());
      this.scrollToBottom();
    }
  }

  private updateLastAssistantMessage(content: string, properties?: ChatPropertyData[]): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.role === 'assistant') {
      last.content = content;
      if (properties) last.properties = properties;
    }
    if (this.messageList) {
      const lastEl = this.messageList.lastElementChild;
      if (lastEl) {
        const data = this.messages[this.messages.length - 1];
        const component = new ChatMessageComponent(data, this.config.onPropertyClick);
        lastEl.replaceWith(component.render());
        this.scrollToBottom();
      }
    }
  }

  private async handleSend(): Promise<void> {
    if (!this.input || this.isSending) return;
    const text = this.input.value.trim();
    if (!text) return;

    this.input.value = '';
    this.autoResizeInput();
    this.isSending = true;
    this.updateSendButton();

    this.addMessage({ role: 'user', content: text });
    this.showTypingIndicator();

    const context: any = { language: this.config.language };
    const propRef = this.config.getCurrentPropertyReference?.();
    if (propRef) context.propertyReference = propRef;
    const favs = this.config.getFavorites?.();
    if (favs?.length) context.favorites = favs;

    let assistantContent = '';
    let properties: ChatPropertyData[] = [];

    try {
      for await (const event of this.client.sendMessage(text, context)) {
        this.hideTypingIndicator();

        switch (event.type) {
          case 'delta':
            if (!assistantContent) {
              this.addMessage({ role: 'assistant', content: event.data.content });
            }
            assistantContent += event.data.content;
            this.updateLastAssistantMessage(assistantContent, properties);
            break;

          case 'tool_result':
            if (event.data.properties) {
              properties = event.data.properties;
            }
            break;

          case 'error':
            this.hideTypingIndicator();
            this.addMessage({ role: 'assistant', content: event.data.message || 'Something went wrong. Please try again.' });
            break;

          case 'done':
            if (properties.length && assistantContent) {
              this.updateLastAssistantMessage(assistantContent, properties);
            }
            break;
        }
      }
    } catch (err) {
      this.hideTypingIndicator();
      this.addMessage({ role: 'assistant', content: 'Connection error. Please try again.' });
    }

    if (!assistantContent) {
      this.hideTypingIndicator();
    }

    this.isSending = false;
    this.updateSendButton();
  }

  private handleNewChat(): void {
    this.client.resetConversation();
    this.messages = [];
    if (this.messageList) this.messageList.innerHTML = '';
    if (this.config.welcomeMessage) {
      this.addMessage({ role: 'assistant', content: this.config.welcomeMessage });
    }
  }

  private showEmailOverlay(): void {
    if (this.emailOverlay) {
      this.emailOverlay.style.display = 'flex';
      const input = this.emailOverlay.querySelector('.spw-chat-email-input') as HTMLInputElement;
      input?.focus();
    }
  }

  private hideEmailOverlay(): void {
    if (this.emailOverlay) this.emailOverlay.style.display = 'none';
  }

  private async handleEmailSend(): Promise<void> {
    const input = this.emailOverlay?.querySelector('.spw-chat-email-input') as HTMLInputElement;
    const email = input?.value.trim();
    if (!email) return;

    const sendBtn = this.emailOverlay?.querySelector('.spw-chat-email-send') as HTMLButtonElement;
    sendBtn.textContent = 'Sending...';
    sendBtn.disabled = true;

    const success = await this.client.emailTranscript(email);

    if (success) {
      this.hideEmailOverlay();
      this.addMessage({ role: 'assistant', content: `Chat transcript sent to ${escapeHtml(email)}` });
    } else {
      sendBtn.textContent = 'Failed - Retry';
    }

    sendBtn.disabled = false;
    if (success) sendBtn.textContent = 'Send';
  }

  private showTypingIndicator(): void {
    if (!this.messageList) return;
    const existing = this.messageList.querySelector('.spw-chat-typing');
    if (existing) return;
    const el = document.createElement('div');
    el.className = 'spw-chat-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    this.messageList.appendChild(el);
    this.scrollToBottom();
  }

  private hideTypingIndicator(): void {
    this.messageList?.querySelector('.spw-chat-typing')?.remove();
  }

  private scrollToBottom(): void {
    if (this.messageList) {
      this.messageList.scrollTop = this.messageList.scrollHeight;
    }
  }

  private autoResizeInput(): void {
    if (!this.input) return;
    this.input.style.height = 'auto';
    this.input.style.height = Math.min(this.input.scrollHeight, 100) + 'px';
  }

  private updateSendButton(): void {
    const btn = this.panel?.querySelector('.spw-chat-send') as HTMLButtonElement;
    if (btn) btn.disabled = !this.input?.value.trim() || this.isSending;
  }

  destroy(): void {
    this.container.remove();
  }
}
