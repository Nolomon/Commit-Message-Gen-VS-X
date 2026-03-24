import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../git", () => ({
  getGitAPI: vi.fn(),
  getActiveRepository: vi.fn(),
  getStagedDiff: vi.fn(),
}));

import { GitService } from "../infrastructure/git-service";
import { getGitAPI, getActiveRepository, getStagedDiff } from "../git";

type GitAPI = Awaited<ReturnType<typeof getGitAPI>>;
type Repository = Awaited<ReturnType<typeof getActiveRepository>>;

const mockGetGitAPI = vi.mocked(getGitAPI);
const mockGetActiveRepository = vi.mocked(getActiveRepository);
const mockGetStagedDiff = vi.mocked(getStagedDiff);

describe("GitService", () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitService();
  });

  describe("getActiveRepository", () => {
    it("calls getGitAPI then getActiveRepository with the result", async () => {
      const fakeGitAPI: GitAPI = { repositories: [] };
      const fakeRepo = { rootUri: { fsPath: "/test/repo" }, inputBox: { value: "" } } as Partial<Repository> as Repository;
      mockGetGitAPI.mockResolvedValue(fakeGitAPI);
      mockGetActiveRepository.mockResolvedValue(fakeRepo);

      await service.getActiveRepository();

      expect(mockGetGitAPI).toHaveBeenCalledOnce();
      expect(mockGetActiveRepository).toHaveBeenCalledWith(fakeGitAPI);
    });

    it("returns an IGitRepository with rootPath from repo.rootUri.fsPath", async () => {
      const fakeRepo = { rootUri: { fsPath: "/my/project" }, inputBox: { value: "" } } as Partial<Repository> as Repository;
      mockGetGitAPI.mockResolvedValue({ repositories: [] });
      mockGetActiveRepository.mockResolvedValue(fakeRepo);

      const result = await service.getActiveRepository();

      expect(result.rootPath).toBe("/my/project");
    });

    it("setCommitMessage writes to repo.inputBox.value", async () => {
      const fakeRepo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } } as Partial<Repository> as Repository;
      mockGetGitAPI.mockResolvedValue({ repositories: [] });
      mockGetActiveRepository.mockResolvedValue(fakeRepo);

      const repo = await service.getActiveRepository();
      repo.setCommitMessage("feat: something new");

      expect(fakeRepo.inputBox.value).toBe("feat: something new");
    });
  });

  describe("getStagedDiff", () => {
    it("delegates to getStagedDiff with the provided path", async () => {
      mockGetStagedDiff.mockResolvedValue("diff --git a/foo.ts\n+new line");

      const result = await service.getStagedDiff("/my/project");

      expect(mockGetStagedDiff).toHaveBeenCalledWith("/my/project");
      expect(result).toBe("diff --git a/foo.ts\n+new line");
    });

    it("propagates errors from getStagedDiff", async () => {
      mockGetStagedDiff.mockRejectedValue(new Error("not a git repo"));

      await expect(service.getStagedDiff("/bad/path")).rejects.toThrow(
        "not a git repo"
      );
    });
  });
});
