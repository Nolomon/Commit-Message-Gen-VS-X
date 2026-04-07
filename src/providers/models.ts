export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "mistral";

export interface ProviderInfo {
  displayName: string;
  baseUrl?: string;
  /** The request body field name for limiting output tokens. */
  tokenParam?: "max_tokens" | "max_completion_tokens";
}

export interface ModelInfo {
  provider: ProviderId;
  displayName: string;
}

export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: { displayName: "Claude" },
  openai: { displayName: "GPT", baseUrl: "https://api.openai.com/v1", tokenParam: "max_completion_tokens" },
  google: { displayName: "Gemini" },
  deepseek: { displayName: "DeepSeek", baseUrl: "https://api.deepseek.com", tokenParam: "max_completion_tokens" },
  mistral: { displayName: "Mistral", baseUrl: "https://api.mistral.ai/v1", tokenParam: "max_tokens" },
};

export const MODELS: Record<string, ModelInfo> = {
  // Anthropic
  "claude-opus-4-6": {
    provider: "anthropic",
    displayName: "Claude Opus 4.6",
  },
  "claude-sonnet-4-6": {
    provider: "anthropic",
    displayName: "Claude Sonnet 4.6",
  },
  "claude-haiku-4-5": {
    provider: "anthropic",
    displayName: "Claude Haiku 4.5",
  },
  // OpenAI
  "gpt-4.1": { provider: "openai", displayName: "GPT-4.1" },
  "gpt-4.1-mini": { provider: "openai", displayName: "GPT-4.1 Mini" },
  "o4-mini": { provider: "openai", displayName: "o4-mini" },
  // Google Gemini
  "gemini-2.5-pro": { provider: "google", displayName: "Gemini 2.5 Pro" },
  "gemini-2.5-flash": { provider: "google", displayName: "Gemini 2.5 Flash" },
  // DeepSeek
  "deepseek-chat": { provider: "deepseek", displayName: "DeepSeek V3.2" },
  "deepseek-reasoner": { provider: "deepseek", displayName: "DeepSeek V3.2 Reasoner" },
  // Mistral
  "mistral-large-latest": {
    provider: "mistral",
    displayName: "Mistral Large 3",
  },
  "codestral-latest": { provider: "mistral", displayName: "Codestral" },
};

export function getProviderForModel(
  modelId: string
): { providerId: ProviderId; provider: ProviderInfo; model: ModelInfo } | undefined {
  const model = MODELS[modelId];
  if (!model) {
    return undefined;
  }
  return {
    providerId: model.provider,
    provider: PROVIDERS[model.provider],
    model,
  };
}

export function getAllProviderIds(): ProviderId[] {
  return Object.keys(PROVIDERS) as ProviderId[];
}
