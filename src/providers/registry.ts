import { CommitMessageProvider } from "./types";
import { ProviderId } from "./models";

export type ProviderCreator = (apiKey: string, modelId: string) => CommitMessageProvider;

const creators = new Map<ProviderId, ProviderCreator>();

export function registerProvider(providerId: ProviderId, creator: ProviderCreator): void {
  creators.set(providerId, creator);
}

export function getProviderCreator(providerId: ProviderId): ProviderCreator | undefined {
  return creators.get(providerId);
}
