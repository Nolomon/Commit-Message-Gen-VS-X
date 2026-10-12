import {
  Disposable,
  IDraftConfig,
  IDraftFiles,
  IDraftUi,
  IOpenRepository,
  IRepositoryTracker,
} from "./ports";

export const DRAFT_FILE_NAME = "COMMIT_MSG_DRAFT";

/**
 * How long a newly watched repository is left alone before its message box is
 * read. The editor restores the box's previous text a moment after a repository
 * opens, and until then the box reads as empty; a file watcher also takes a
 * moment to start reporting.
 */
export const REPOSITORY_SETTLE_MS = 2000;

export type DraftSituation =
  | { origin: "arrived"; draft: string; currentMessage: string }
  | {
      /** The file was already there when watching began, so its age is unknown. */
      origin: "leftover";
      draft: string;
      currentMessage: string;
      hasStagedChanges: boolean;
    };

export type DraftDecision = "apply" | "ask" | "ignore" | "discard";

export function decideDraft(situation: DraftSituation): DraftDecision {
  const draft = situation.draft.trim();
  const current = situation.currentMessage.trim();

  if (!draft) {
    return "discard";
  }
  if (situation.origin === "leftover") {
    return !current && situation.hasStagedChanges ? "apply" : "discard";
  }
  if (!current) {
    return "apply";
  }
  return current === draft ? "ignore" : "ask";
}

interface RepositorySession {
  readonly repo: IOpenRepository;
  closed: boolean;
  watcher?: Disposable;
  /** Set once the watcher has reported the file, which proves it is new. */
  sawDraftWritten: boolean;
  /** The draft waiting on the user's answer. A newer draft supersedes it. */
  pendingDraft?: string;
  /** Serializes work per repository so one draft is never handled twice. */
  queue: Promise<void>;
}

export interface CommitDraftDeps {
  repositories: IRepositoryTracker;
  files: IDraftFiles;
  ui: IDraftUi;
  config: IDraftConfig;
  wait?: (ms: number) => Promise<void>;
}

/**
 * Moves commit messages that other tools leave in a repository's draft file
 * into that repository's message box. It only ever fills the box.
 */
export class CommitDraftService implements Disposable {
  private readonly sessions = new Map<string, RepositorySession>();
  private readonly wait: (ms: number) => Promise<void>;
  private tracking: Disposable | undefined;
  private configListener: Disposable | undefined;

  constructor(private readonly deps: CommitDraftDeps) {
    this.wait =
      deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  start(): void {
    this.configListener = this.deps.config.onDidChangeDraftFileEnabled(() =>
      this.syncWithSetting()
    );
    this.syncWithSetting();
  }

  dispose(): void {
    this.configListener?.dispose();
    this.configListener = undefined;
    this.stopTracking();
  }

  private syncWithSetting(): void {
    if (!this.deps.config.isDraftFileEnabled()) {
      this.stopTracking();
      return;
    }
    if (!this.tracking) {
      this.tracking = this.deps.repositories.trackRepositories({
        opened: (repo) => this.openSession(repo),
        closed: (rootPath) => this.closeSession(rootPath),
      });
    }
  }

  private stopTracking(): void {
    this.tracking?.dispose();
    this.tracking = undefined;
    for (const rootPath of [...this.sessions.keys()]) {
      this.closeSession(rootPath);
    }
  }

  private openSession(repo: IOpenRepository): void {
    if (this.sessions.has(repo.rootPath)) {
      return;
    }
    const session: RepositorySession = {
      repo,
      closed: false,
      sawDraftWritten: false,
      queue: Promise.resolve(),
    };
    this.sessions.set(repo.rootPath, session);
    this.enqueue(session, () => this.beginWatching(session));
  }

  private closeSession(rootPath: string): void {
    const session = this.sessions.get(rootPath);
    if (!session) {
      return;
    }
    session.closed = true;
    session.pendingDraft = undefined;
    session.watcher?.dispose();
    this.sessions.delete(rootPath);
  }

  private enqueue(session: RepositorySession, task: () => Promise<void>): void {
    session.queue = session.queue.then(task).catch((error: unknown) => {
      console.warn("AI Commit: could not handle a commit message draft.", error);
    });
  }

  private async beginWatching(session: RepositorySession): Promise<void> {
    const draftPath = await session.repo.resolveGitPath(DRAFT_FILE_NAME);
    if (session.closed) {
      return;
    }
    session.watcher = this.deps.files.watch(draftPath, () => {
      session.sawDraftWritten = true;
      this.enqueue(session, () => this.consume(session, draftPath, "arrived"));
    });

    // Watching starts first so nothing written from here on is missed; the one
    // check for a file that was already there waits for the box to be readable.
    await this.wait(REPOSITORY_SETTLE_MS);
    await this.consume(
      session,
      draftPath,
      session.sawDraftWritten ? "arrived" : "leftover"
    );
  }

  private async consume(
    session: RepositorySession,
    draftPath: string,
    origin: DraftSituation["origin"]
  ): Promise<void> {
    if (session.closed) {
      return;
    }
    // A missing file is the normal state, and also what the loser of a race
    // with another window on the same repository sees.
    const text = await this.deps.files.read(draftPath);
    if (text === undefined) {
      return;
    }
    try {
      await this.deps.files.remove(draftPath);
    } catch (error: unknown) {
      // The text is already in hand, so it is still offered to the box.
      console.warn("AI Commit: could not delete the commit message draft.", error);
    }

    const draft = text.trim();
    if (!draft) {
      return;
    }
    // Staged changes are looked up before the box is read, so the box is read
    // as late as possible.
    const hasStagedChanges =
      origin === "leftover" && (await session.repo.hasStagedChanges());
    if (session.closed) {
      return;
    }
    const currentMessage = session.repo.getCommitMessage();
    const decision = decideDraft(
      origin === "leftover"
        ? { origin, draft, currentMessage, hasStagedChanges }
        : { origin, draft, currentMessage }
    );

    session.pendingDraft = undefined;
    if (decision === "apply") {
      this.apply(session, draft);
    } else if (decision === "ask") {
      void this.ask(session, draft);
    }
  }

  private async ask(session: RepositorySession, draft: string): Promise<void> {
    session.pendingDraft = draft;
    let replace = false;
    try {
      replace = await this.deps.ui.confirmReplace(
        session.repo.rootPath,
        draft.split("\n", 1)[0]
      );
    } catch {
      // Treated like dismissing the question: the current message stays.
    }
    // Answering a question about a draft that has since been superseded, or
    // for a repository that is no longer watched, changes nothing.
    if (session.closed || session.pendingDraft !== draft) {
      return;
    }
    session.pendingDraft = undefined;
    if (replace) {
      this.apply(session, draft);
    }
  }

  private apply(session: RepositorySession, draft: string): void {
    const focusInput = this.deps.config.shouldFocusMessageBox();
    session.repo.setCommitMessage(draft, { focusInput });
    if (!focusInput) {
      this.deps.ui.revealSourceControl();
    }
  }
}
