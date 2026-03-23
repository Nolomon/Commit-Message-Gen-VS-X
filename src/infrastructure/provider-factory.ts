import { IProviderFactory } from "../core/ports";
import { CommitMessageProvider } from "../providers/types";
import { createProvider } from "../providers/factory";

export class ProviderFactory implements IProviderFactory {
  create(modelId: string, apiKey: string): CommitMessageProvider {
    return createProvider(modelId, apiKey);
  }
}
