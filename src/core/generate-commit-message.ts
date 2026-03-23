import { IConfigService, IGitService, IProviderFactory, ISecretStore, SECRET_KEY_PREFIX } from "./ports";
import { getProviderForModel } from "../providers/models";
import { NoDiffError, UnknownModelError, NoApiKeyError } from "./errors";

export interface GenerateResult {
  message: string;
}

export interface ApiKeyResolver {
  resolve(providerId: string, providerDisplayName: string): Promise<string | undefined>;
}

export async function generateCommitMessage(deps: {
  gitService: IGitService;
  configService: IConfigService;
  secretStore: ISecretStore;
  providerFactory: IProviderFactory;
  apiKeyResolver: ApiKeyResolver;
}): Promise<GenerateResult> {
  const { gitService, configService, secretStore, providerFactory, apiKeyResolver } = deps;

  const repo = await gitService.getActiveRepository();
  const diff = await gitService.getStagedDiff(repo.rootPath);

  if (!diff.trim()) {
    throw new NoDiffError("No staged changes found. Stage some changes first.");
  }

  const modelId = configService.getModelId();
  const info = getProviderForModel(modelId);
  if (!info) {
    throw new UnknownModelError(
      `Unknown model "${modelId}". Check your commitMessageGen.model setting.`
    );
  }

  const { providerId, provider: providerInfo } = info;
  const secretKey = `${SECRET_KEY_PREFIX}${providerId}`;

  let apiKey = await secretStore.get(secretKey);
  if (!apiKey) {
    apiKey = await apiKeyResolver.resolve(providerId, providerInfo.displayName);
    if (!apiKey) {
      throw new NoApiKeyError("No API key provided.");
    }
    await secretStore.store(secretKey, apiKey);
  }

  const provider = providerFactory.create(modelId, apiKey);
  try {
    const message = await provider.generate(diff);
    return { message };
  } finally {
    provider.dispose();
  }
}

