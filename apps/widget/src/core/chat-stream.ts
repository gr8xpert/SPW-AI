// The website chat (POST /api/v1/chat) answers as server-sent events:
//   event: conversation | tool_call | tool_result | delta | done | error
//   data: <json>
// Chunks can end anywhere, so this keeps the unfinished tail until the
// blank line that ends an event arrives.

export interface ChatStreamEvent {
  type: string;
  data: Record<string, unknown>;
}

export function createChatStreamParser(onEvent: (e: ChatStreamEvent) => void) {
  let buffer = '';

  const flush = (block: string) => {
    let type = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) return;
    try {
      const parsed = JSON.parse(data.join('\n'));
      onEvent({ type, data: parsed && typeof parsed === 'object' ? parsed : { value: parsed } });
    } catch {
      // Not ours; ignore.
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n/g, '\n');
      let end = buffer.indexOf('\n\n');
      while (end !== -1) {
        flush(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf('\n\n');
      }
    },
    end() {
      if (buffer.trim()) flush(buffer);
      buffer = '';
    },
  };
}

// A listing as the chat's search tool returns it (not the full Property).
export interface ChatProperty {
  id: number;
  reference: string;
  slug?: string | null;
  title: string;
  listingType?: string;
  price?: number | null;
  priceOnRequest?: boolean;
  currency?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  buildSize?: number | null;
  location?: string;
  propertyType?: string;
  image?: string | null;
}

export function chatProperties(value: unknown): ChatProperty[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is ChatProperty => !!p && typeof p === 'object' && typeof (p as ChatProperty).id === 'number' && typeof (p as ChatProperty).reference === 'string')
    .slice(0, 6);
}
