import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { execFile } from "child_process";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import { getGitAPI, getActiveRepository, getStagedDiff } from "../git";

const mockExecFile = vi.mocked(execFile);
const mockExtensions = vi.mocked(vscode.extensions);
const mockWindow = vi.mocked(vscode.window);

describe("getGitAPI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when git extension not found", async () => {
    mockExtensions.getExtension.mockReturnValue(undefined);

    await expect(getGitAPI()).rejects.toThrow("Git extension not found");
  });

  it("activates inactive extension", async () => {
    const mockActivate = vi.fn();
    const mockGitAPI = { repositories: [] };
    mockExtensions.getExtension.mockReturnValue({
      isActive: false,
      activate: mockActivate,
      exports: { getAPI: () => mockGitAPI },
    } as any);

    await getGitAPI();

    expect(mockActivate).toHaveBeenCalledOnce();
  });

  it("does not activate already-active extension", async () => {
    const mockActivate = vi.fn();
    const mockGitAPI = { repositories: [] };
    mockExtensions.getExtension.mockReturnValue({
      isActive: true,
      activate: mockActivate,
      exports: { getAPI: () => mockGitAPI },
    } as any);

    await getGitAPI();

    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("returns GitAPI from exports", async () => {
    const mockGitAPI = { repositories: [] };
    mockExtensions.getExtension.mockReturnValue({
      isActive: true,
      exports: { getAPI: () => mockGitAPI },
    } as any);

    const result = await getGitAPI();
    expect(result).toBe(mockGitAPI);
  });
});

describe("getActiveRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockWindow as any).activeTextEditor = undefined;
  });

  it("throws when no repositories", async () => {
    await expect(
      getActiveRepository({ repositories: [] } as any)
    ).rejects.toThrow("No Git repositories found");
  });

  it("returns single repository directly", async () => {
    const repo = { rootUri: { fsPath: "/repo" } };
    const result = await getActiveRepository({
      repositories: [repo],
    } as any);
    expect(result).toBe(repo);
  });

  it("matches active editor path for multi-repo", async () => {
    const repo1 = { rootUri: { fsPath: "/repo1" } };
    const repo2 = { rootUri: { fsPath: "/repo2" } };

    (mockWindow as any).activeTextEditor = {
      document: { uri: { fsPath: "/repo2/src/file.ts" } },
    };

    const result = await getActiveRepository({
      repositories: [repo1, repo2],
    } as any);
    expect(result).toBe(repo2);
  });

  it("shows quick pick when no editor match", async () => {
    const repo1 = { rootUri: { fsPath: "/repo1" } };
    const repo2 = { rootUri: { fsPath: "/repo2" } };

    (mockWindow as any).activeTextEditor = undefined;
    mockWindow.showQuickPick.mockResolvedValueOnce({
      label: "/repo1",
      repo: repo1,
    } as any);

    const result = await getActiveRepository({
      repositories: [repo1, repo2],
    } as any);
    expect(mockWindow.showQuickPick).toHaveBeenCalledOnce();
    expect(result).toBe(repo1);
  });

  it("throws when user dismisses quick pick", async () => {
    const repo1 = { rootUri: { fsPath: "/repo1" } };
    const repo2 = { rootUri: { fsPath: "/repo2" } };

    (mockWindow as any).activeTextEditor = undefined;
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await expect(
      getActiveRepository({ repositories: [repo1, repo2] } as any)
    ).rejects.toThrow("No repository selected");
  });
});

describe("getStagedDiff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with stdout on success", async () => {
    mockExecFile.mockImplementation(
      ((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "diff content", "");
      }) as any
    );

    const result = await getStagedDiff("/test/repo");
    expect(result).toBe("diff content");
  });

  it("calls git with correct arguments", async () => {
    mockExecFile.mockImplementation(
      ((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "", "");
      }) as any
    );

    await getStagedDiff("/test/repo");

    expect(mockExecFile).toHaveBeenCalledWith(
      "git",
      ["diff", "--staged"],
      { cwd: "/test/repo", maxBuffer: 10 * 1024 * 1024 },
      expect.any(Function)
    );
  });

  it("rejects with stderr on error", async () => {
    mockExecFile.mockImplementation(
      ((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(new Error("fail"), "", "fatal: not a repo");
      }) as any
    );

    await expect(getStagedDiff("/test/repo")).rejects.toThrow(
      "fatal: not a repo"
    );
  });

  it("rejects with error.message when no stderr", async () => {
    mockExecFile.mockImplementation(
      ((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(new Error("ENOENT"), "", "");
      }) as any
    );

    await expect(getStagedDiff("/test/repo")).rejects.toThrow("ENOENT");
  });
});
