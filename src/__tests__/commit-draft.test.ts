import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  Disposable,
  IDraftConfig,
  IDraftFiles,
  IDraftUi,
  IOpenRepository,
  IRepositoryTracker,
  RepositoryListener,
} from "../core/ports";
import {
  CommitDraftService,
  DRAFT_FILE_NAME,
  REPOSITORY_SETTLE_MS,
  decideDraft,
} from "../core/commit-draft";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Lets every already-resolved step of the service run. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function makeRepo(
  options: { rootPath?: string; message?: string; staged?: boolean } = {},
  overrides: Partial<IOpenRepository> = {}
) {
  const rootPath = options.rootPath ?? "/repo";
  const box = { value: options.message ?? "" };
  const repo: IOpenRepository = {
    rootPath,
    getCommitMessage: vi.fn(() => box.value),
    setCommitMessage: vi.fn((message: string) => {
      box.value = message;
    }),
    hasStagedChanges: vi.fn(async () => options.staged ?? true),
    resolveGitPath: vi.fn(async (name: string) => `${rootPath}/.git/${name}`),
    ...overrides,
  };
  return { repo, box, draftPath: `${rootPath}/.git/${DRAFT_FILE_NAME}` };
}

/** An in-memory git directory: writing a file notifies whoever watches its path. */
function makeFiles(overrides: Partial<IDraftFiles> = {}) {
  const contents = new Map<string, string>();
  const watchers = new Map<string, Set<() => void>>();
  const notify = (filePath: string) => {
    for (const onWritten of [...(watchers.get(filePath) ?? [])]) {
      onWritten();
    }
  };
  const files: IDraftFiles = {
    watch: vi.fn((filePath: string, onWritten: () => void): Disposable => {
      const listeners = watchers.get(filePath) ?? new Set<() => void>();
      watchers.set(filePath, listeners);
      listeners.add(onWritten);
      return { dispose: () => listeners.delete(onWritten) };
    }),
    read: vi.fn(async (filePath: string) => contents.get(filePath)),
    remove: vi.fn(async (filePath: string) => {
      contents.delete(filePath);
    }),
    ...overrides,
  };
  return {
    files,
    contents,
    notify,
    watcherCount: (filePath: string) => watchers.get(filePath)?.size ?? 0,
    /** What a writer's rename-into-place looks like to the extension. */
    write(filePath: string, text: string) {
      contents.set(filePath, text);
      notify(filePath);
    },
  };
}

function makeTracker() {
  let listener: RepositoryListener | undefined;
  const dispose = vi.fn(() => {
    listener = undefined;
  });
  const tracker: IRepositoryTracker = {
    trackRepositories: vi.fn((next: RepositoryListener) => {
      listener = next;
      return { dispose };
    }),
  };
  return {
    tracker,
    dispose,
    open: (repo: IOpenRepository) => listener?.opened(repo),
    close: (rootPath: string) => listener?.closed(rootPath),
  };
}

function makeConfig(initial: { enabled?: boolean; focus?: boolean } = {}) {
  const state = { enabled: initial.enabled ?? true, focus: initial.focus ?? false };
  const listeners = new Set<() => void>();
  const config: IDraftConfig = {
    isDraftFileEnabled: vi.fn(() => state.enabled),
    shouldFocusMessageBox: vi.fn(() => state.focus),
    onDidChangeDraftFileEnabled: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    }),
  };
  return {
    config,
    state,
    listenerCount: () => listeners.size,
    setEnabled(enabled: boolean) {
      state.enabled = enabled;
      for (const listener of [...listeners]) {
        listener();
      }
    },
  };
}

/** Each question stays open until the test answers it. */
function makeUi() {
  const questions: Deferred<boolean>[] = [];
  const ui: IDraftUi = {
    confirmReplace: vi.fn(() => {
      const question = deferred<boolean>();
      questions.push(question);
      return question.promise;
    }),
    revealSourceControl: vi.fn(),
  };
  return { ui, questions };
}

function setup(
  options: {
    config?: ReturnType<typeof makeConfig>;
    files?: ReturnType<typeof makeFiles>;
    wait?: (ms: number) => Promise<void>;
  } = {}
) {
  const tracker = makeTracker();
  const files = options.files ?? makeFiles();
  const ui = makeUi();
  const config = options.config ?? makeConfig();
  const wait = vi.fn(options.wait ?? (async () => undefined));
  const service = new CommitDraftService({
    repositories: tracker.tracker,
    files: files.files,
    ui: ui.ui,
    config: config.config,
    wait,
  });
  return { service, tracker, files, ui, config, wait };
}

/** A running service with one repository open and its startup check done. */
async function setupWatching(
  repoOptions: Parameters<typeof makeRepo>[0] = {},
  options: Parameters<typeof setup>[0] = {}
) {
  const ctx = setup(options);
  const repository = makeRepo(repoOptions);
  ctx.service.start();
  ctx.tracker.open(repository.repo);
  await flush();
  return { ...ctx, ...repository };
}

describe("decideDraft", () => {
  it.each([
    ["an empty box is filled", "feat: a", "", "apply"],
    ["a whitespace-only box counts as empty", "feat: a", "  \n", "apply"],
    ["the same text is left alone", "feat: a", "feat: a", "ignore"],
    ["surrounding whitespace does not make it different", "feat: a\n", " feat: a ", "ignore"],
    ["different text is never overwritten silently", "feat: a", "fix: b", "ask"],
    ["an empty draft is discarded", "", "fix: b", "discard"],
    ["a whitespace-only draft is discarded", " \n\t\n", "", "discard"],
  ] as const)("arrived: %s", (_name, draft, currentMessage, expected) => {
    expect(decideDraft({ origin: "arrived", draft, currentMessage })).toBe(expected);
  });

  it.each([
    ["applied when the box is empty and changes are staged", "feat: a", "", true, "apply"],
    ["discarded when nothing is staged", "feat: a", "", false, "discard"],
    ["discarded, not asked about, when the box has text", "feat: a", "fix: b", true, "discard"],
    ["discarded when empty", "  ", "", true, "discard"],
  ] as const)("leftover: %s", (_name, draft, currentMessage, hasStagedChanges, expected) => {
    expect(
      decideDraft({ origin: "leftover", draft, currentMessage, hasStagedChanges })
    ).toBe(expected);
  });
});

describe("CommitDraftService", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe("a draft arriving", () => {
    it("watches the path git gives for COMMIT_MSG_DRAFT", async () => {
      const { repo, files } = await setupWatching();

      expect(repo.resolveGitPath).toHaveBeenCalledWith("COMMIT_MSG_DRAFT");
      expect(files.files.watch).toHaveBeenCalledWith(
        "/repo/.git/COMMIT_MSG_DRAFT",
        expect.any(Function)
      );
    });

    it("fills an empty box with the trimmed text and deletes the file", async () => {
      const { repo, box, files, draftPath, ui } = await setupWatching();

      files.write(draftPath, "\nfeat(draft): add draft file\n\n- body line\n\n");
      await flush();

      expect(box.value).toBe("feat(draft): add draft file\n\n- body line");
      expect(files.contents.has(draftPath)).toBe(false);
      expect(ui.ui.confirmReplace).not.toHaveBeenCalled();
      expect(repo.hasStagedChanges).not.toHaveBeenCalled();
    });

    it("reads the file, deletes it, then sets the message, in that order", async () => {
      const { repo, files, draftPath } = await setupWatching();
      vi.mocked(files.files.read).mockClear();

      files.write(draftPath, "feat: a\n");
      await flush();

      const readAt = vi.mocked(files.files.read).mock.invocationCallOrder[0];
      const removeAt = vi.mocked(files.files.remove).mock.invocationCallOrder[0];
      const setAt = vi.mocked(repo.setCommitMessage).mock.invocationCallOrder[0];
      expect(readAt).toBeLessThan(removeAt);
      expect(removeAt).toBeLessThan(setAt);
    });

    it("does nothing but delete the file when the box already holds the same text", async () => {
      const { repo, files, draftPath, ui } = await setupWatching({ message: "feat: a" });

      files.write(draftPath, "feat: a\n");
      await flush();

      expect(files.contents.has(draftPath)).toBe(false);
      expect(repo.setCommitMessage).not.toHaveBeenCalled();
      expect(ui.ui.confirmReplace).not.toHaveBeenCalled();
      expect(ui.ui.revealSourceControl).not.toHaveBeenCalled();
    });

    it("deletes an empty draft and otherwise ignores it", async () => {
      const { repo, files, draftPath, ui } = await setupWatching({ message: "fix: mine" });

      files.write(draftPath, "");
      await flush();
      files.write(draftPath, "  \n\t\n");
      await flush();

      expect(files.files.remove).toHaveBeenCalledTimes(2);
      expect(files.contents.has(draftPath)).toBe(false);
      expect(repo.setCommitMessage).not.toHaveBeenCalled();
      expect(ui.ui.confirmReplace).not.toHaveBeenCalled();
    });
  });

  describe("when the box holds a different message", () => {
    it("deletes the file and asks instead of overwriting", async () => {
      const { repo, box, files, draftPath, ui } = await setupWatching({ message: "fix: mine" });

      files.write(draftPath, "feat: theirs\n\n- detail\n");
      await flush();

      expect(box.value).toBe("fix: mine");
      expect(repo.setCommitMessage).not.toHaveBeenCalled();
      expect(files.contents.has(draftPath)).toBe(false);
      expect(ui.ui.confirmReplace).toHaveBeenCalledWith("/repo", "feat: theirs");
    });

    it("replaces the message from memory once the user agrees", async () => {
      const { box, files, draftPath, ui } = await setupWatching({ message: "fix: mine" });
      files.write(draftPath, "feat: theirs\n\n- detail\n");
      await flush();

      ui.questions[0].resolve(true);
      await flush();

      expect(box.value).toBe("feat: theirs\n\n- detail");
      expect(files.files.read).toHaveBeenCalledTimes(2); // startup check + the draft
    });

    it("keeps the message when the user declines or dismisses the question", async () => {
      const { repo, box, files, draftPath, ui } = await setupWatching({ message: "fix: mine" });
      files.write(draftPath, "feat: theirs\n");
      await flush();

      ui.questions[0].resolve(false);
      await flush();

      expect(box.value).toBe("fix: mine");
      expect(repo.setCommitMessage).not.toHaveBeenCalled();
    });

    it("keeps the message when the question cannot be shown", async () => {
      const { repo, files, draftPath, ui } = await setupWatching({ message: "fix: mine" });
      vi.mocked(ui.ui.confirmReplace).mockRejectedValueOnce(new Error("no window"));

      files.write(draftPath, "feat: theirs\n");
      await flush();

      expect(repo.setCommitMessage).not.toHaveBeenCalled();
    });

    it("lets a newer draft supersede the one being asked about", async () => {
      const { box, files, draftPath, ui } = await setupWatching({ message: "fix: mine" });
      files.write(draftPath, "feat: first\n");
      await flush();
      files.write(draftPath, "feat: second\n");
      await flush();
      expect(ui.ui.confirmReplace).toHaveBeenCalledTimes(2);

      ui.questions[0].resolve(true);
      await flush();
      expect(box.value).toBe("fix: mine");

      ui.questions[1].resolve(true);
      await flush();
      expect(box.value).toBe("feat: second");
    });

    it("does not let declining a superseded question discard the newer draft", async () => {
      const { box, files, draftPath, ui } = await setupWatching({ message: "fix: mine" });
      files.write(draftPath, "feat: first\n");
      await flush();
      files.write(draftPath, "feat: second\n");
      await flush();

      ui.questions[0].resolve(false);
      await flush();
      ui.questions[1].resolve(true);
      await flush();

      expect(box.value).toBe("feat: second");
    });

    it("drops the question's draft once a later draft has been applied directly", async () => {
      const { box, files, draftPath, ui } = await setupWatching({ message: "fix: mine" });
      files.write(draftPath, "feat: first\n");
      await flush();
      box.value = "";
      files.write(draftPath, "feat: second\n");
      await flush();
      expect(box.value).toBe("feat: second");

      ui.questions[0].resolve(true);
      await flush();

      expect(box.value).toBe("feat: second");
    });
  });

  describe("a draft left from before watching began", () => {
    it("is applied when the box is empty and changes are staged", async () => {
      const files = makeFiles();
      files.contents.set("/repo/.git/COMMIT_MSG_DRAFT", "feat: earlier\n");

      const { box } = await setupWatching({ staged: true }, { files });

      expect(box.value).toBe("feat: earlier");
      expect(files.contents.has("/repo/.git/COMMIT_MSG_DRAFT")).toBe(false);
    });

    it("is deleted without being applied when nothing is staged", async () => {
      const files = makeFiles();
      files.contents.set("/repo/.git/COMMIT_MSG_DRAFT", "feat: earlier\n");

      const { repo, ui } = await setupWatching({ staged: false }, { files });

      expect(repo.setCommitMessage).not.toHaveBeenCalled();
      expect(ui.ui.confirmReplace).not.toHaveBeenCalled();
      expect(files.contents.has("/repo/.git/COMMIT_MSG_DRAFT")).toBe(false);
    });

    it("is deleted without asking when the box already has text", async () => {
      const files = makeFiles();
      files.contents.set("/repo/.git/COMMIT_MSG_DRAFT", "feat: earlier\n");

      const { repo, box, ui } = await setupWatching(
        { staged: true, message: "fix: mine" },
        { files }
      );

      expect(box.value).toBe("fix: mine");
      expect(repo.setCommitMessage).not.toHaveBeenCalled();
      expect(ui.ui.confirmReplace).not.toHaveBeenCalled();
      expect(files.contents.has("/repo/.git/COMMIT_MSG_DRAFT")).toBe(false);
    });

    it("never resurfaces: the startup rule applies once, later drafts are new", async () => {
      const files = makeFiles();
      files.contents.set("/repo/.git/COMMIT_MSG_DRAFT", "feat: earlier\n");
      const { repo, box, draftPath } = await setupWatching({ staged: false }, { files });
      expect(repo.setCommitMessage).not.toHaveBeenCalled();

      files.write(draftPath, "feat: fresh\n");
      await flush();

      expect(box.value).toBe("feat: fresh");
      expect(repo.hasStagedChanges).toHaveBeenCalledTimes(1);
    });

    it("waits for the box to be readable before deciding, so restored text is not overwritten", async () => {
      const settle = deferred<void>();
      const files = makeFiles();
      files.contents.set("/repo/.git/COMMIT_MSG_DRAFT", "feat: earlier\n");
      const ctx = setup({ files, wait: () => settle.promise });
      const { repo, box } = makeRepo({ staged: true });
      ctx.service.start();
      ctx.tracker.open(repo);
      await flush();

      // Watching has started, but the file has not been touched yet.
      expect(ctx.wait).toHaveBeenCalledWith(REPOSITORY_SETTLE_MS);
      expect(files.files.watch).toHaveBeenCalledTimes(1);
      expect(files.files.read).not.toHaveBeenCalled();

      // The editor restores what the user typed last session.
      box.value = "fix: typed last session";
      settle.resolve();
      await flush();

      expect(box.value).toBe("fix: typed last session");
      expect(repo.setCommitMessage).not.toHaveBeenCalled();
      expect(files.contents.has("/repo/.git/COMMIT_MSG_DRAFT")).toBe(false);
    });

    it("treats a draft written while it waits as new, not as a leftover", async () => {
      const settle = deferred<void>();
      const files = makeFiles();
      const ctx = setup({ files, wait: () => settle.promise });
      const { repo, box, draftPath } = makeRepo({ staged: false });
      ctx.service.start();
      ctx.tracker.open(repo);
      await flush();

      files.write(draftPath, "feat: fresh\n");
      await flush();
      expect(repo.setCommitMessage).not.toHaveBeenCalled();
      settle.resolve();
      await flush();

      expect(box.value).toBe("feat: fresh");
      expect(repo.setCommitMessage).toHaveBeenCalledTimes(1);
      expect(repo.hasStagedChanges).not.toHaveBeenCalled();
    });
  });

  describe("the same repository open in two windows", () => {
    it("ignores a file the other window already took", async () => {
      const { repo, files, draftPath, ui } = await setupWatching();
      vi.mocked(files.files.remove).mockClear();

      // The watcher fires, but the file is gone by the time it is read.
      files.notify(draftPath);
      await flush();

      expect(repo.setCommitMessage).not.toHaveBeenCalled();
      expect(files.files.remove).not.toHaveBeenCalled();
      expect(ui.ui.confirmReplace).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it("still fills its own box when the other window deleted the file first", async () => {
      const files = makeFiles({
        // Not-found on delete is swallowed by the file port, so it resolves.
        remove: vi.fn(async () => undefined),
      });
      const { box, draftPath } = await setupWatching({}, { files });

      files.write(draftPath, "feat: both windows\n");
      await flush();

      expect(box.value).toBe("feat: both windows");
    });

    it("handles one draft once when the watcher reports it twice", async () => {
      const { repo, files, draftPath, ui } = await setupWatching({ message: "fix: mine" });

      files.contents.set(draftPath, "feat: theirs\n");
      files.notify(draftPath);
      files.notify(draftPath);
      await flush();

      expect(ui.ui.confirmReplace).toHaveBeenCalledTimes(1);
      expect(files.files.remove).toHaveBeenCalledTimes(1);
      expect(repo.setCommitMessage).not.toHaveBeenCalled();
    });
  });

  describe("repositories opening and closing", () => {
    it("gives each repository its own watcher and its own box", async () => {
      const ctx = setup();
      const first = makeRepo({ rootPath: "/first" });
      const second = makeRepo({ rootPath: "/second" });
      ctx.service.start();
      ctx.tracker.open(first.repo);
      ctx.tracker.open(second.repo);
      await flush();

      ctx.files.write(second.draftPath, "feat: for second\n");
      await flush();

      expect(ctx.files.watcherCount(first.draftPath)).toBe(1);
      expect(ctx.files.watcherCount(second.draftPath)).toBe(1);
      expect(second.box.value).toBe("feat: for second");
      expect(first.repo.setCommitMessage).not.toHaveBeenCalled();
    });

    it("starts watching a repository that opens later", async () => {
      const ctx = await setupWatching({ rootPath: "/first" });
      const later = makeRepo({ rootPath: "/later" });

      ctx.tracker.open(later.repo);
      await flush();
      ctx.files.write(later.draftPath, "feat: later\n");
      await flush();

      expect(later.box.value).toBe("feat: later");
    });

    it("does not watch the same repository twice", async () => {
      const ctx = await setupWatching();

      ctx.tracker.open(ctx.repo);
      await flush();

      expect(ctx.files.watcherCount(ctx.draftPath)).toBe(1);
    });

    it("stops watching a repository that closes", async () => {
      const { repo, files, draftPath, tracker } = await setupWatching();

      tracker.close("/repo");
      files.write(draftPath, "feat: nobody home\n");
      await flush();

      expect(files.watcherCount(draftPath)).toBe(0);
      expect(repo.setCommitMessage).not.toHaveBeenCalled();
      expect(files.contents.has(draftPath)).toBe(true);
    });

    it("drops a pending question's draft when its repository closes", async () => {
      const { repo, files, draftPath, tracker, ui } = await setupWatching({ message: "fix: mine" });
      files.write(draftPath, "feat: theirs\n");
      await flush();

      tracker.close("/repo");
      ui.questions[0].resolve(true);
      await flush();

      expect(repo.setCommitMessage).not.toHaveBeenCalled();
    });

    it("does not start a watcher for a repository that closed while its path was resolving", async () => {
      const gitPath = deferred<string>();
      const ctx = setup();
      const { repo } = makeRepo({}, { resolveGitPath: vi.fn(() => gitPath.promise) });
      ctx.service.start();
      ctx.tracker.open(repo);

      ctx.tracker.close("/repo");
      gitPath.resolve("/repo/.git/COMMIT_MSG_DRAFT");
      await flush();

      expect(ctx.files.files.watch).not.toHaveBeenCalled();
    });

    it("watches again when a closed repository reopens", async () => {
      const { repo, box, files, draftPath, tracker } = await setupWatching();

      tracker.close("/repo");
      tracker.open(repo);
      await flush();
      files.write(draftPath, "feat: back\n");
      await flush();

      expect(files.watcherCount(draftPath)).toBe(1);
      expect(box.value).toBe("feat: back");
    });
  });

  describe("commitMessageGen.draftFile.enabled", () => {
    it("does not track repositories when off", async () => {
      const config = makeConfig({ enabled: false });
      const ctx = setup({ config });

      ctx.service.start();
      await flush();

      expect(ctx.tracker.tracker.trackRepositories).not.toHaveBeenCalled();
    });

    it("starts watching when turned on, without a reload", async () => {
      const config = makeConfig({ enabled: false });
      const ctx = setup({ config });
      const { repo, box, draftPath } = makeRepo();
      ctx.service.start();

      config.setEnabled(true);
      ctx.tracker.open(repo);
      await flush();
      ctx.files.write(draftPath, "feat: now on\n");
      await flush();

      expect(box.value).toBe("feat: now on");
    });

    it("applies the leftover rule to a draft written while it was off", async () => {
      const config = makeConfig({ enabled: false });
      const ctx = setup({ config });
      const { repo, box, draftPath } = makeRepo({ staged: false });
      ctx.service.start();
      ctx.files.write(draftPath, "feat: written while off\n");
      await flush();
      expect(ctx.files.contents.has(draftPath)).toBe(true);

      config.setEnabled(true);
      ctx.tracker.open(repo);
      await flush();

      expect(box.value).toBe("");
      expect(ctx.files.contents.has(draftPath)).toBe(false);
    });

    it("stops every watcher when turned off, without a reload", async () => {
      const ctx = await setupWatching();

      ctx.config.setEnabled(false);
      ctx.files.write(ctx.draftPath, "feat: off\n");
      await flush();

      expect(ctx.tracker.dispose).toHaveBeenCalledTimes(1);
      expect(ctx.files.watcherCount(ctx.draftPath)).toBe(0);
      expect(ctx.repo.setCommitMessage).not.toHaveBeenCalled();
      expect(ctx.files.contents.has(ctx.draftPath)).toBe(true);
    });

    it("drops a pending question's draft when turned off", async () => {
      const ctx = await setupWatching({ message: "fix: mine" });
      ctx.files.write(ctx.draftPath, "feat: theirs\n");
      await flush();

      ctx.config.setEnabled(false);
      ctx.ui.questions[0].resolve(true);
      await flush();

      expect(ctx.repo.setCommitMessage).not.toHaveBeenCalled();
    });

    it("tracks once however often an unrelated change leaves it on", async () => {
      const ctx = await setupWatching();

      ctx.config.setEnabled(true);
      ctx.config.setEnabled(true);

      expect(ctx.tracker.tracker.trackRepositories).toHaveBeenCalledTimes(1);
      expect(ctx.files.watcherCount(ctx.draftPath)).toBe(1);
    });

    it("can be turned off and on again", async () => {
      const ctx = await setupWatching();

      ctx.config.setEnabled(false);
      ctx.config.setEnabled(true);
      ctx.tracker.open(ctx.repo);
      await flush();
      ctx.files.write(ctx.draftPath, "feat: on again\n");
      await flush();

      expect(ctx.tracker.tracker.trackRepositories).toHaveBeenCalledTimes(2);
      expect(ctx.box.value).toBe("feat: on again");
    });

    it("stops everything on dispose", async () => {
      const ctx = await setupWatching();

      ctx.service.dispose();
      ctx.config.setEnabled(true);

      expect(ctx.tracker.dispose).toHaveBeenCalledTimes(1);
      expect(ctx.files.watcherCount(ctx.draftPath)).toBe(0);
      expect(ctx.config.listenerCount()).toBe(0);
      expect(ctx.tracker.tracker.trackRepositories).toHaveBeenCalledTimes(1);
    });
  });

  describe("showing the result", () => {
    it("reveals Source Control without taking focus when focusMessageBox is off", async () => {
      const { repo, files, draftPath, ui } = await setupWatching(
        {},
        { config: makeConfig({ focus: false }) }
      );

      files.write(draftPath, "feat: a\n");
      await flush();

      expect(repo.setCommitMessage).toHaveBeenCalledWith("feat: a", { focusInput: false });
      expect(ui.ui.revealSourceControl).toHaveBeenCalledTimes(1);
    });

    it("moves focus into the box when focusMessageBox is on", async () => {
      const { repo, files, draftPath, ui } = await setupWatching(
        {},
        { config: makeConfig({ focus: true }) }
      );

      files.write(draftPath, "feat: a\n");
      await flush();

      expect(repo.setCommitMessage).toHaveBeenCalledWith("feat: a", { focusInput: true });
      expect(ui.ui.revealSourceControl).not.toHaveBeenCalled();
    });

    it("reads focusMessageBox when the draft is applied, not at startup", async () => {
      const config = makeConfig({ focus: false });
      const { repo, files, draftPath } = await setupWatching({}, { config });

      config.state.focus = true;
      files.write(draftPath, "feat: a\n");
      await flush();

      expect(repo.setCommitMessage).toHaveBeenCalledWith("feat: a", { focusInput: true });
    });

    it("shows the result after the user agrees to replace, too", async () => {
      const { files, draftPath, ui } = await setupWatching({ message: "fix: mine" });
      files.write(draftPath, "feat: theirs\n");
      await flush();

      ui.questions[0].resolve(true);
      await flush();

      expect(ui.ui.revealSourceControl).toHaveBeenCalledTimes(1);
    });
  });

  describe("failures", () => {
    it("leaves a repository unwatched when git cannot give the draft path", async () => {
      const ctx = setup();
      const { repo } = makeRepo(
        {},
        { resolveGitPath: vi.fn().mockRejectedValue(new Error("not a git repository")) }
      );
      ctx.service.start();

      ctx.tracker.open(repo);
      await flush();

      expect(ctx.files.files.watch).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it("leaves the box alone when the draft cannot be read, and keeps watching", async () => {
      const { box, files, draftPath } = await setupWatching();
      vi.mocked(files.files.read).mockRejectedValueOnce(new Error("EACCES"));

      files.write(draftPath, "feat: unreadable\n");
      await flush();
      expect(box.value).toBe("");
      expect(warn).toHaveBeenCalledTimes(1);

      files.write(draftPath, "feat: readable\n");
      await flush();
      expect(box.value).toBe("feat: readable");
    });

    it("still applies a draft it read but could not delete", async () => {
      const files = makeFiles({ remove: vi.fn().mockRejectedValue(new Error("EPERM")) });
      const { box, draftPath } = await setupWatching({}, { files });

      files.write(draftPath, "feat: stuck file\n");
      await flush();

      expect(box.value).toBe("feat: stuck file");
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});
