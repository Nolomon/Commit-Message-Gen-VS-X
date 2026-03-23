import { CommitMessageProvider } from "../providers/types";

export const SECRET_KEY_PREFIX = "commitMessageGen.apiKey.";

export interface IGitRepository {
  readonly rootPath: string;
  setCommitMessage(message: string): void;
}

export interface IGitService {
  getActiveRepository(): Promise<IGitRepository>;
  getStagedDiff(repoRoot: string): Promise<string>;
}

export interface ISecretStore {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface IConfigService {
  getModelId(): string;
  setModelId(modelId: string): Promise<void>;
}

export interface IProviderFactory {
  create(modelId: string, apiKey: string): CommitMessageProvider;
}
