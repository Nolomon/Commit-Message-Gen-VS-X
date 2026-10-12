import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { execFile } from "child_process";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import { GitService } from "../infrastructure/git-service";
import type { IOpenRepository, RepositoryListener } from "../core/ports";

type MockGitExtension = vscode.Extension<{ getAPI: (version: 1) => { repositories: Repository[] } }>;
type Repository = { rootUri: { fsPath: string }; inputBox: { value: string } };
type RepoPickItem = { label: string; repo: Repository };
type WritableMockWindow = { activeTextEditor: vscode.TextEditor | undefined };
type RepositoryEventListener = (repo: Repository) => void;
type ExecFileCallback = (error: (Error & { code?: number }) | null, stdout: string, stderr: string) => void;

/** A git extension whose open/close events the test can fire. */
function makeTrackableGit(repositories: Repository[] = []) {
  const openListeners = new Set<RepositoryEventListener>();
  const closeListeners = new Set<RepositoryEventListener>();
  const subscribe = (listeners: Set<RepositoryEventListener>) =>
    vi.fn((listener: RepositoryEventListener) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    });
  const api = {
    repositories,
    onDidOpenRepository: subscribe(openListeners),
    onDidCloseRepository: subscribe(closeListeners),
  };
  return {
    extension: {
      isActive: true,
      exports: { getAPI: () => api },
    } as Partial<MockGitExtension> as MockGitExtension,
    fireOpen: (repo: Repository) => openListeners.forEach((listener) => listener(repo)),
    fireClose: (repo: Repository) => closeListeners.forEach((listener) => listener(repo)),
    listenerCount: () => openListeners.size + closeListeners.size,
  };
}

function makeListener() {
  const opened: IOpenRepository[] = [];
  const listener: RepositoryListener = {
    opened: vi.fn((repo: IOpenRepository) => {
      opened.push(repo);
    }),
    closed: vi.fn(),
  };
  return { listener, opened };
}

function mockGit(respond: (args: string[], callback: ExecFileCallback) => void) {
  mockExecFile.mockImplementation(
    ((_cmd: string, args: string[], _opts: object, callback: ExecFileCallback) => {
      respond(args, callback);
    }) as unknown as typeof execFile
  );
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const mockExecFile = vi.mocked(execFile);
const mockExtensions = vi.mocked(vscode.extensions);
const mockWindow = vi.mocked(vscode.window);
const mockCommands = vi.mocked(vscode.commands);

describe("GitService", () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitService();
    (mockWindow as WritableMockWindow).activeTextEditor = undefined;
  });

  describe("getActiveRepository", () => {
    it("throws when git extension not found", async () => {
      mockExtensions.getExtension.mockReturnValue(undefined);

      await expect(service.getActiveRepository()).rejects.toThrow("Git extension not found");
    });

    it("activates inactive extension", async () => {
      const mockActivate = vi.fn();
      const repo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } };
      mockExtensions.getExtension.mockReturnValue({
        isActive: false,
        activate: mockActivate,
        exports: { getAPI: () => ({ repositories: [repo] }) },
      } as Partial<MockGitExtension> as MockGitExtension);

      await service.getActiveRepository();

      expect(mockActivate).toHaveBeenCalledOnce();
    });

    it("does not activate already-active extension", async () => {
      const mockActivate = vi.fn();
      const repo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } };
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        activate: mockActivate,
        exports: { getAPI: () => ({ repositories: [repo] }) },
      } as Partial<MockGitExtension> as MockGitExtension);

      await service.getActiveRepository();

      expect(mockActivate).not.toHaveBeenCalled();
    });

    it("throws when no repositories", async () => {
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        exports: { getAPI: () => ({ repositories: [] }) },
      } as Partial<MockGitExtension> as MockGitExtension);

      await expect(service.getActiveRepository()).rejects.toThrow("No Git repositories found");
    });

    it("returns single repository directly", async () => {
      const repo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } };
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        exports: { getAPI: () => ({ repositories: [repo] }) },
      } as Partial<MockGitExtension> as MockGitExtension);

      const result = await service.getActiveRepository();

      expect(result.rootPath).toBe("/repo");
    });

    it("matches active editor path for multi-repo", async () => {
      const repo1 = { rootUri: { fsPath: "/repo1" }, inputBox: { value: "" } };
      const repo2 = { rootUri: { fsPath: "/repo2" }, inputBox: { value: "" } };
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        exports: { getAPI: () => ({ repositories: [repo1, repo2] }) },
      } as Partial<MockGitExtension> as MockGitExtension);
      (mockWindow as WritableMockWindow).activeTextEditor = {
        document: { uri: { fsPath: "/repo2/src/file.ts" } },
      } as Partial<vscode.TextEditor> as vscode.TextEditor;

      const result = await service.getActiveRepository();

      expect(result.rootPath).toBe("/repo2");
    });

    it("shows quick pick when no editor match", async () => {
      const repo1 = { rootUri: { fsPath: "/repo1" }, inputBox: { value: "" } };
      const repo2 = { rootUri: { fsPath: "/repo2" }, inputBox: { value: "" } };
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        exports: { getAPI: () => ({ repositories: [repo1, repo2] }) },
      } as Partial<MockGitExtension> as MockGitExtension);
      mockWindow.showQuickPick.mockResolvedValueOnce({
        label: "/repo1",
        repo: repo1,
      } as Partial<RepoPickItem> as RepoPickItem);

      const result = await service.getActiveRepository();

      expect(mockWindow.showQuickPick).toHaveBeenCalledOnce();
      expect(result.rootPath).toBe("/repo1");
    });

    it("throws when user dismisses quick pick", async () => {
      const repo1 = { rootUri: { fsPath: "/repo1" }, inputBox: { value: "" } };
      const repo2 = { rootUri: { fsPath: "/repo2" }, inputBox: { value: "" } };
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        exports: { getAPI: () => ({ repositories: [repo1, repo2] }) },
      } as Partial<MockGitExtension> as MockGitExtension);
      mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

      await expect(service.getActiveRepository()).rejects.toThrow("No repository selected");
    });

    it("shows quick pick when editor file is outside all repo roots", async () => {
      const repo1 = { rootUri: { fsPath: "/repo1" }, inputBox: { value: "" } };
      const repo2 = { rootUri: { fsPath: "/repo2" }, inputBox: { value: "" } };
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        exports: { getAPI: () => ({ repositories: [repo1, repo2] }) },
      } as Partial<MockGitExtension> as MockGitExtension);
      (mockWindow as WritableMockWindow).activeTextEditor = {
        document: { uri: { fsPath: "/unrelated/file.ts" } },
      } as Partial<vscode.TextEditor> as vscode.TextEditor;
      mockWindow.showQuickPick.mockResolvedValueOnce({
        label: "/repo2",
        repo: repo2,
      } as Partial<RepoPickItem> as RepoPickItem);

      const result = await service.getActiveRepository();

      expect(mockWindow.showQuickPick).toHaveBeenCalledOnce();
      expect(result.rootPath).toBe("/repo2");
    });

    it("does not false-positive on a path that is a prefix of another repo root", async () => {
      // /repo1 is a prefix of /repo12 — startsWith would wrongly match repo1
      const repo1 = { rootUri: { fsPath: "/repo1" }, inputBox: { value: "" } };
      const repo12 = { rootUri: { fsPath: "/repo12" }, inputBox: { value: "" } };
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        exports: { getAPI: () => ({ repositories: [repo1, repo12] }) },
      } as Partial<MockGitExtension> as MockGitExtension);
      (mockWindow as WritableMockWindow).activeTextEditor = {
        document: { uri: { fsPath: "/repo12/src/file.ts" } },
      } as Partial<vscode.TextEditor> as vscode.TextEditor;

      const result = await service.getActiveRepository();

      expect(result.rootPath).toBe("/repo12");
    });

    it("setCommitMessage writes to repo.inputBox.value", async () => {
      const repo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } };
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        exports: { getAPI: () => ({ repositories: [repo] }) },
      } as Partial<MockGitExtension> as MockGitExtension);

      const result = await service.getActiveRepository();
      result.setCommitMessage("feat: something new");

      expect(repo.inputBox.value).toBe("feat: something new");
    });

    it("setCommitMessage focuses the box and scrolls it to the top by default", async () => {
      const repo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } };
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        exports: { getAPI: () => ({ repositories: [repo] }) },
      } as Partial<MockGitExtension> as MockGitExtension);

      const result = await service.getActiveRepository();
      result.setCommitMessage("feat: something new");
      await Promise.resolve();

      expect(mockCommands.executeCommand).toHaveBeenNthCalledWith(
        1,
        "workbench.scm.focus"
      );
      expect(mockCommands.executeCommand).toHaveBeenNthCalledWith(2, "cursorTop");
    });

    it("setCommitMessage leaves focus alone when focusInput is false", async () => {
      const repo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } };
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        exports: { getAPI: () => ({ repositories: [repo] }) },
      } as Partial<MockGitExtension> as MockGitExtension);

      const result = await service.getActiveRepository();
      result.setCommitMessage("feat: something new", { focusInput: false });
      await Promise.resolve();

      expect(repo.inputBox.value).toBe("feat: something new");
      expect(mockCommands.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe("trackRepositories", () => {
    it("reports the repositories that are already open", async () => {
      const git = makeTrackableGit([
        { rootUri: { fsPath: "/one" }, inputBox: { value: "" } },
        { rootUri: { fsPath: "/two" }, inputBox: { value: "" } },
      ]);
      mockExtensions.getExtension.mockReturnValue(git.extension);
      const { listener, opened } = makeListener();

      service.trackRepositories(listener);
      await flush();

      expect(opened.map((repo) => repo.rootPath)).toEqual(["/one", "/two"]);
    });

    it("reports repositories as the git extension opens and closes them", async () => {
      const git = makeTrackableGit();
      mockExtensions.getExtension.mockReturnValue(git.extension);
      const { listener, opened } = makeListener();
      service.trackRepositories(listener);
      await flush();
      const repo = { rootUri: { fsPath: "/later" }, inputBox: { value: "" } };

      git.fireOpen(repo);
      git.fireClose(repo);

      expect(opened.map((r) => r.rootPath)).toEqual(["/later"]);
      expect(listener.closed).toHaveBeenCalledWith("/later");
    });

    it("stops reporting once disposed", async () => {
      const git = makeTrackableGit();
      mockExtensions.getExtension.mockReturnValue(git.extension);
      const { listener } = makeListener();
      const tracking = service.trackRepositories(listener);
      await flush();

      tracking.dispose();
      git.fireOpen({ rootUri: { fsPath: "/later" }, inputBox: { value: "" } });

      expect(git.listenerCount()).toBe(0);
      expect(listener.opened).not.toHaveBeenCalled();
    });

    it("reports nothing when disposed before the git extension is ready", async () => {
      const git = makeTrackableGit([{ rootUri: { fsPath: "/one" }, inputBox: { value: "" } }]);
      mockExtensions.getExtension.mockReturnValue(git.extension);
      const { listener } = makeListener();

      service.trackRepositories(listener).dispose();
      await flush();

      expect(listener.opened).not.toHaveBeenCalled();
      expect(git.listenerCount()).toBe(0);
    });

    it("stays quiet when the git extension is missing", async () => {
      mockExtensions.getExtension.mockReturnValue(undefined);
      const { listener } = makeListener();

      expect(() => service.trackRepositories(listener)).not.toThrow();
      await flush();

      expect(listener.opened).not.toHaveBeenCalled();
    });

    it("stays quiet when git is disabled and the API is unavailable", async () => {
      mockExtensions.getExtension.mockReturnValue({
        isActive: true,
        exports: {
          getAPI: () => {
            throw new Error("Git model not found");
          },
        },
      } as Partial<MockGitExtension> as MockGitExtension);
      const { listener } = makeListener();

      service.trackRepositories(listener);
      await flush();

      expect(listener.opened).not.toHaveBeenCalled();
    });

    describe("a tracked repository", () => {
      async function track(repo: Repository): Promise<IOpenRepository> {
        mockExtensions.getExtension.mockReturnValue(makeTrackableGit([repo]).extension);
        const { listener, opened } = makeListener();
        service.trackRepositories(listener);
        await flush();
        return opened[0];
      }

      it("reads the message box live", async () => {
        const repo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } };
        const tracked = await track(repo);

        repo.inputBox.value = "fix: typed by the user";

        expect(tracked.getCommitMessage()).toBe("fix: typed by the user");
      });

      it("writes the message box without touching focus when asked not to", async () => {
        const repo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } };
        const tracked = await track(repo);

        tracked.setCommitMessage("feat: from a draft", { focusInput: false });
        await Promise.resolve();

        expect(repo.inputBox.value).toBe("feat: from a draft");
        expect(mockCommands.executeCommand).not.toHaveBeenCalled();
      });

      it("focuses the box like generation does when asked to", async () => {
        const tracked = await track({ rootUri: { fsPath: "/repo" }, inputBox: { value: "" } });

        tracked.setCommitMessage("feat: from a draft", { focusInput: true });
        await Promise.resolve();

        expect(mockCommands.executeCommand).toHaveBeenNthCalledWith(1, "workbench.scm.focus");
        expect(mockCommands.executeCommand).toHaveBeenNthCalledWith(2, "cursorTop");
      });

      it("has staged changes when git diff --cached --quiet exits with 1", async () => {
        const tracked = await track({ rootUri: { fsPath: "/repo" }, inputBox: { value: "" } });
        mockGit((_args, callback) =>
          callback(Object.assign(new Error("exit 1"), { code: 1 }), "", "")
        );

        await expect(tracked.hasStagedChanges()).resolves.toBe(true);
        expect(mockExecFile).toHaveBeenCalledWith(
          "git",
          ["diff", "--cached", "--quiet"],
          { cwd: "/repo" },
          expect.any(Function)
        );
      });

      it("has no staged changes when git diff --cached --quiet exits with 0", async () => {
        const tracked = await track({ rootUri: { fsPath: "/repo" }, inputBox: { value: "" } });
        mockGit((_args, callback) => callback(null, "", ""));

        await expect(tracked.hasStagedChanges()).resolves.toBe(false);
      });

      it("reports no staged changes when git itself fails", async () => {
        const tracked = await track({ rootUri: { fsPath: "/repo" }, inputBox: { value: "" } });
        mockGit((_args, callback) =>
          callback(Object.assign(new Error("fatal"), { code: 128 }), "", "fatal: not a repo")
        );

        await expect(tracked.hasStagedChanges()).resolves.toBe(false);
      });

      it("resolves a git path against the repository root", async () => {
        const tracked = await track({ rootUri: { fsPath: "/repo" }, inputBox: { value: "" } });
        mockGit((_args, callback) => callback(null, ".git/COMMIT_MSG_DRAFT\n", ""));

        await expect(tracked.resolveGitPath("COMMIT_MSG_DRAFT")).resolves.toBe(
          "/repo/.git/COMMIT_MSG_DRAFT"
        );
        expect(mockExecFile).toHaveBeenCalledWith(
          "git",
          ["rev-parse", "--git-path", "COMMIT_MSG_DRAFT"],
          { cwd: "/repo" },
          expect.any(Function)
        );
      });

      it("keeps the absolute git path a linked worktree reports", async () => {
        const tracked = await track({ rootUri: { fsPath: "/worktree" }, inputBox: { value: "" } });
        mockGit((_args, callback) =>
          callback(null, "/main/.git/worktrees/worktree/COMMIT_MSG_DRAFT\n", "")
        );

        await expect(tracked.resolveGitPath("COMMIT_MSG_DRAFT")).resolves.toBe(
          "/main/.git/worktrees/worktree/COMMIT_MSG_DRAFT"
        );
      });

      it("rejects when git cannot resolve the path", async () => {
        const tracked = await track({ rootUri: { fsPath: "/repo" }, inputBox: { value: "" } });
        mockGit((_args, callback) =>
          callback(new Error("fail"), "", "fatal: not a git repository")
        );

        await expect(tracked.resolveGitPath("COMMIT_MSG_DRAFT")).rejects.toThrow(
          "fatal: not a git repository"
        );
      });
    });
  });

  describe("getStagedDiff", () => {
    it("resolves with stdout on success", async () => {
      mockExecFile.mockImplementation(
        ((_cmd: string, _args: string[], _opts: object, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
          callback(null, "diff content", "");
        }) as unknown as typeof execFile
      );

      const result = await service.getStagedDiff("/test/repo");

      expect(result).toBe("diff content");
    });

    it("calls git with correct arguments", async () => {
      mockExecFile.mockImplementation(
        ((_cmd: string, _args: string[], _opts: object, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
          callback(null, "", "");
        }) as unknown as typeof execFile
      );

      await service.getStagedDiff("/test/repo");

      expect(mockExecFile).toHaveBeenCalledWith(
        "git",
        ["diff", "--staged"],
        { cwd: "/test/repo", maxBuffer: 10 * 1024 * 1024 },
        expect.any(Function)
      );
    });

    it("rejects with stderr on error", async () => {
      mockExecFile.mockImplementation(
        ((_cmd: string, _args: string[], _opts: object, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
          callback(new Error("fail"), "", "fatal: not a repo");
        }) as unknown as typeof execFile
      );

      await expect(service.getStagedDiff("/test/repo")).rejects.toThrow("fatal: not a repo");
    });

    it("rejects with error.message when no stderr", async () => {
      mockExecFile.mockImplementation(
        ((_cmd: string, _args: string[], _opts: object, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
          callback(new Error("ENOENT"), "", "");
        }) as unknown as typeof execFile
      );

      await expect(service.getStagedDiff("/test/repo")).rejects.toThrow("ENOENT");
    });
  });
});
