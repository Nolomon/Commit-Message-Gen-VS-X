import { CommitMessageProvider } from "./types";
import { getProviderForModel } from "./models";
import { getProviderCreator } from "./registry";
import { UnknownModelError } from "../core/errors";

// Import provider modules to trigger self-registration
import "./claude";
import "./gemini";
import "./openai-compatible";

export function createProvider(
  modelId: string,
  apiKey: string
): CommitMessageProvider {
  const info = getProviderForModel(modelId);
  if (!info) {
    throw new UnknownModelError(
      `Unknown model "${modelId}". Check your commitMessageGen.model setting.`
    );
  }

  const creator = getProviderCreator(info.providerId);
  if (!creator) {
    throw new Error(`No provider registered for "${info.providerId}".`);
  }

  return creator(apiKey, modelId);
}
