import { CommitMessageProvider } from "./types";
import { ClaudeProvider } from "./claude";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { GeminiProvider } from "./gemini";
import { getProviderForModel, PROVIDERS } from "./models";

export function createProvider(
  modelId: string,
  apiKey: string
): CommitMessageProvider {
  const info = getProviderForModel(modelId);
  if (!info) {
    throw new Error(
      `Unknown model "${modelId}". Check your commitMessageGen.model setting.`
    );
  }

  switch (info.providerId) {
    case "anthropic":
      return new ClaudeProvider(apiKey, modelId);
    case "openai":
      return new OpenAICompatibleProvider(
        apiKey,
        modelId,
        "https://api.openai.com/v1",
        PROVIDERS.openai.displayName
      );
    case "google":
      return new GeminiProvider(apiKey, modelId);
    case "deepseek":
      return new OpenAICompatibleProvider(
        apiKey,
        modelId,
        "https://api.deepseek.com",
        PROVIDERS.deepseek.displayName
      );
    case "mistral":
      return new OpenAICompatibleProvider(
        apiKey,
        modelId,
        "https://api.mistral.ai/v1",
        PROVIDERS.mistral.displayName
      );
    default: {
      const _exhaustive: never = info.providerId;
      throw new Error(`No provider implementation for "${_exhaustive}".`);
    }
  }
}
