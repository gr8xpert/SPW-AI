import { escapeHtml } from '../utils/helpers';
import { ChatPropertyCard, ChatPropertyData } from './ChatPropertyCard';

export interface ChatMessageData {
  role: 'user' | 'assistant';
  content: string;
  properties?: ChatPropertyData[];
  toolName?: string;
}

export class ChatMessageComponent {
  private data: ChatMessageData;
  private onPropertyClick?: (reference: string) => void;

  constructor(data: ChatMessageData, onPropertyClick?: (reference: string) => void) {
    this.data = data;
    this.onPropertyClick = onPropertyClick;
  }

  render(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = `spw-chat-msg spw-chat-msg-${this.data.role}`;

    const bubble = document.createElement('div');
    bubble.className = 'spw-chat-bubble';
    bubble.innerHTML = this.formatContent(this.data.content);
    wrapper.appendChild(bubble);

    if (this.data.properties?.length) {
      const grid = document.createElement('div');
      grid.className = 'spw-chat-properties';
      for (const prop of this.data.properties) {
        const card = new ChatPropertyCard(prop, this.onPropertyClick);
        grid.appendChild(card.render());
      }
      wrapper.appendChild(grid);
    }

    return wrapper;
  }

  private formatContent(text: string): string {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }
}
