import { ToolDefinition } from '../../ai/ai.service';

export interface ChatToolResult {
  toolCallId: string;
  toolName: string;
  result: any;
}

export interface SSEEvent {
  type: 'conversation' | 'delta' | 'tool_call' | 'tool_result' | 'done' | 'error';
  data: any;
}

export interface ChatContext {
  propertyReference?: string;
  favorites?: number[];
  recentlyViewed?: string[];
  currentFilters?: Record<string, any>;
  language?: string;
}

export { ToolDefinition };
