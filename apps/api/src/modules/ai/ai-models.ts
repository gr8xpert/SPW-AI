// Models offered in Settings → AI. Checked against OpenRouter's live catalog
// before being shown (see OpenRouterCatalogService), so one that OpenRouter
// retires disappears from the list instead of failing every request.
// Review this list when new model generations come out; the IDs are
// OpenRouter's (https://openrouter.ai/models).
export interface RecommendedModel {
  id: string;
  label: string;
  note: string;
}

export const RECOMMENDED_MODELS: RecommendedModel[] = [
  { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash (Recommended)', note: 'Fast, strong translations, low cost' },
  { id: 'google/gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', note: 'Cheapest Gemini' },
  { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', note: 'Fast and cheap' },
  { id: 'openai/gpt-5.4-mini', label: 'GPT-5.4 Mini', note: 'Balanced' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5', note: 'Fast Claude' },
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', note: 'Best quality, higher cost' },
];

// Last-resort models when neither the tenant nor the environment names a
// usable one. Kept to current OpenRouter IDs (note the dot in "haiku-4.5").
export const FALLBACK_DEFAULT_MODEL = 'anthropic/claude-sonnet-5';
export const FALLBACK_ENRICHMENT_MODEL = 'anthropic/claude-haiku-4.5';
