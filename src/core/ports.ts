import { CommitMessageProvider } from "../providers/types";

export const SECRET_KEY_PREFIX = "commitMessageGen.apiKey.";

export interface SetCommitMessageOptions {
  /**
   * Move focus and the caret to the commit message box. Skipped when the user
   * has started working elsewhere while the message was being generated.
   * Defaults to true.
   */
  focusInput?: boolean;
}

export interface IGitRepository {
  readonly rootPath: string;
  setCommitMessage(message: string, options?: SetCommitMessageOptions): void;
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
  shouldFocusMessageBox(): boolean;
}

export interface IProviderFactory {
  create(modelId: string, apiKey: string): CommitMessageProvider;
}

export interface Disposable {
  dispose(): void;
}

/** A repository the built-in git extension currently has open. */
export interface IOpenRepository extends IGitRepository {
  getCommitMessage(): string;
  hasStagedChanges(): Promise<boolean>;
  /** Absolute path that `git rev-parse --git-path <name>` gives for this repository. */
  resolveGitPath(name: string): Promise<string>;
}

export interface RepositoryListener {
  opened(repo: IOpenRepository): void;
  closed(rootPath: string): void;
}

export interface IRepositoryTracker {
  /**
   * Reports every repository that is open now, then each one that opens or
   * closes, until the returned handle is disposed.
   */
  trackRepositories(listener: RepositoryListener): Disposable;
}

export interface IDraftFiles {
  /** Calls `onWritten` each time a file appears at `filePath` or is replaced there. */
  watch(filePath: string, onWritten: () => void): Disposable;
  /** Resolves to undefined when the file does not exist. */
  read(filePath: string): Promise<string | undefined>;
  /** Resolves normally when the file is already gone. */
  remove(filePath: string): Promise<void>;
}

export interface IDraftUi {
  /** Asks whether the draft should replace the message already in the box. */
  confirmReplace(repoRootPath: string, draftSubject: string): Promise<boolean>;
  /** Shows the Source Control view without moving keyboard focus. */
  revealSourceControl(): void;
}

export interface IDraftConfig {
  isDraftFileEnabled(): boolean;
  shouldFocusMessageBox(): boolean;
  onDidChangeDraftFileEnabled(listener: () => void): Disposable;
}
