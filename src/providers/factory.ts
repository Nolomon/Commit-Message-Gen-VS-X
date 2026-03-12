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

    case "google":
      return new GeminiProvider(apiKey, modelId);

    case "openai":
    case "deepseek":
    case "mistral": {
      const providerInfo = PROVIDERS[info.providerId];
      return new OpenAICompatibleProvider(
        apiKey,
        modelId,
        providerInfo.baseUrl!,
        providerInfo.displayName
      );
    }

    default: {
      const _exhaustive: never = info.providerId;
      throw new Error(`No provider implementation for "${_exhaustive}".`);
    }
  }
}
