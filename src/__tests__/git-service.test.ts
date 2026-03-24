import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { execFile } from "child_process";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import { GitService } from "../infrastructure/git-service";

type MockGitExtension = vscode.Extension<{ getAPI: (version: 1) => { repositories: Repository[] } }>;
type Repository = { rootUri: { fsPath: string }; inputBox: { value: string } };
type RepoPickItem = { label: string; repo: Repository };
type WritableMockWindow = { activeTextEditor: vscode.TextEditor | undefined };

const mockExecFile = vi.mocked(execFile);
const mockExtensions = vi.mocked(vscode.extensions);
const mockWindow = vi.mocked(vscode.window);

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
