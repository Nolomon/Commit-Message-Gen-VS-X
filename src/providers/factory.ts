import { CommitMessageProvider } from "./types";
import { ClaudeProvider } from "./claude";

const PROVIDERS: Record<
  string,
  new (apiKey: string, model: string) => CommitMessageProvider
> = {
  anthropic: ClaudeProvider,
};

export function createProvider(
  providerName: string,
  model: string,
  apiKey: string
): CommitMessageProvider {
  const Provider = PROVIDERS[providerName];
  if (!Provider) {
    const supported = Object.keys(PROVIDERS).join(", ");
    throw new Error(
      `Unknown provider "${providerName}". Supported providers: ${supported}`
    );
  }
  return new Provider(apiKey, model);
}

export function getSupportedProviders(): string[] {
  return Object.keys(PROVIDERS);
}
