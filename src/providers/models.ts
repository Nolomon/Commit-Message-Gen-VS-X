export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "mistral";

export interface ProviderInfo {
  displayName: string;
}

export interface ModelInfo {
  provider: ProviderId;
  displayName: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: { displayName: "Claude" },
  openai: { displayName: "GPT" },
  google: { displayName: "Gemini" },
  deepseek: { displayName: "DeepSeek" },
  mistral: { displayName: "Mistral" },
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
  "gpt-4o": { provider: "openai", displayName: "GPT-4o" },
  "gpt-4o-mini": { provider: "openai", displayName: "GPT-4o Mini" },
  "o3-mini": { provider: "openai", displayName: "o3-mini" },
  // Google Gemini
  "gemini-2.5-pro": { provider: "google", displayName: "Gemini 2.5 Pro" },
  "gemini-2.0-flash": { provider: "google", displayName: "Gemini 2.0 Flash" },
  // DeepSeek
  "deepseek-chat": { provider: "deepseek", displayName: "DeepSeek V3" },
  "deepseek-reasoner": { provider: "deepseek", displayName: "DeepSeek R1" },
  // Mistral
  "mistral-large-latest": {
    provider: "mistral",
    displayName: "Mistral Large",
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
