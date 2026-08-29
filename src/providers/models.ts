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

/** Extra request-body fields merged into the provider call for a given model. */
export type ModelRequestOptions = Record<string, unknown>;

export interface ModelInfo {
  provider: ProviderId;
  displayName: string;
  /**
   * Model-specific request fields. Current-generation models reason by default
   * and charge those tokens against the output cap, so models that support it
   * are asked for minimal reasoning — a commit message does not need any.
   */
  requestOptions?: ModelRequestOptions;
}

export const DEFAULT_MODEL_ID = "claude-sonnet-5";

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: { displayName: "Claude" },
  openai: { displayName: "GPT", baseUrl: "https://api.openai.com/v1", tokenParam: "max_completion_tokens" },
  google: { displayName: "Gemini" },
  deepseek: { displayName: "DeepSeek", baseUrl: "https://api.deepseek.com", tokenParam: "max_tokens" },
  mistral: { displayName: "Mistral", baseUrl: "https://api.mistral.ai/v1", tokenParam: "max_tokens" },
};

export const MODELS: Record<string, ModelInfo> = {
  // Anthropic
  "claude-opus-5": {
    provider: "anthropic",
    displayName: "Claude Opus 5",
    requestOptions: { output_config: { effort: "low" } },
  },
  "claude-sonnet-5": {
    provider: "anthropic",
    displayName: "Claude Sonnet 5",
    requestOptions: { output_config: { effort: "low" } },
  },
  // Haiku 4.5 predates the effort parameter and rejects it.
  "claude-haiku-4-5": {
    provider: "anthropic",
    displayName: "Claude Haiku 4.5",
  },
  // OpenAI
  "gpt-5.6-sol": {
    provider: "openai",
    displayName: "GPT-5.6 Sol",
    requestOptions: { reasoning_effort: "none" },
  },
  "gpt-5.6-terra": {
    provider: "openai",
    displayName: "GPT-5.6 Terra",
    requestOptions: { reasoning_effort: "none" },
  },
  "gpt-5.6-luna": {
    provider: "openai",
    displayName: "GPT-5.6 Luna",
    requestOptions: { reasoning_effort: "none" },
  },
  // Google Gemini
  "gemini-3.7-flash": {
    provider: "google",
    displayName: "Gemini 3.7 Flash",
    requestOptions: { generationConfig: { thinkingLevel: "minimal" } },
  },
  "gemini-3.1-flash-lite": {
    provider: "google",
    displayName: "Gemini 3.1 Flash-Lite",
    requestOptions: { generationConfig: { thinkingLevel: "minimal" } },
  },
  // "minimal" is Flash/Lite only, so Pro uses the next level up.
  "gemini-3.1-pro-preview": {
    provider: "google",
    displayName: "Gemini 3.1 Pro (Preview)",
    requestOptions: { generationConfig: { thinkingLevel: "low" } },
  },
  // DeepSeek
  "deepseek-v4-flash": {
    provider: "deepseek",
    displayName: "DeepSeek V4 Flash",
    requestOptions: { thinking: { type: "disabled" } },
  },
  "deepseek-v4-pro": {
    provider: "deepseek",
    displayName: "DeepSeek V4 Pro",
    requestOptions: { thinking: { type: "disabled" } },
  },
  // Mistral
  "mistral-medium-latest": {
    provider: "mistral",
    displayName: "Mistral Medium 3.5",
  },
  "codestral-latest": { provider: "mistral", displayName: "Codestral" },
};

/**
 * Models this extension has shipped in the past, mapped to their closest
 * current equivalent. A selected model that is retired would otherwise fail
 * every generation until the user picked a new one by hand, so the setting is
 * migrated on activation. Entries are kept indefinitely — a user may upgrade
 * from any earlier version.
 */
export const RETIRED_MODEL_REPLACEMENTS: Record<string, string> = {
  // Anthropic
  "claude-opus-4-6": "claude-opus-5",
  "claude-sonnet-4-6": "claude-sonnet-5",
  // OpenAI
  "gpt-4.1": "gpt-5.6-sol",
  "gpt-4.1-mini": "gpt-5.6-terra",
  "o4-mini": "gpt-5.6-luna",
  "gpt-4o": "gpt-5.6-sol",
  "gpt-4o-mini": "gpt-5.6-luna",
  "o3-mini": "gpt-5.6-luna",
  // Google Gemini
  "gemini-2.5-pro": "gemini-3.1-pro-preview",
  "gemini-2.5-flash": "gemini-3.7-flash",
  "gemini-2.0-flash": "gemini-3.7-flash",
  // DeepSeek
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro",
  // Mistral
  "mistral-large-latest": "mistral-medium-latest",
};

/**
 * The current model that replaces a retired one, or undefined if the ID is
 * already current or was never shipped.
 */
export function getReplacementModel(modelId: string): string | undefined {
  if (MODELS[modelId]) {
    return undefined;
  }
  const replacement = RETIRED_MODEL_REPLACEMENTS[modelId];
  return replacement && MODELS[replacement] ? replacement : undefined;
}

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
