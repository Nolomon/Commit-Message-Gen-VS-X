import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import type {
  IGitService,
  ISecretStore,
  IConfigService,
  IProviderFactory,
  IGitRepository,
} from "../core/ports";
import type { CommitMessageProvider } from "../providers/types";
import { generateHandler } from "../commands/generate";

type ActionQuickPickItem = vscode.QuickPickItem & { id: string };
type ModelQuickPickItem = vscode.QuickPickItem & { modelId: string };

describe("generateHandler", () => {
  let mockGitService: IGitService;
  let mockSecretStore: ISecretStore;
  let mockConfigService: IConfigService;
  let mockProviderFactory: IProviderFactory;
  let mockProvider: CommitMessageProvider;
  let mockRepo: IGitRepository;

  const mockWindow = vi.mocked(vscode.window);
  const mockCommands = vi.mocked(vscode.commands);

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      rootPath: "/test/repo",
      setCommitMessage: vi.fn(),
    };

    mockProvider = {
      name: "test-provider",
      generate: vi.fn().mockResolvedValue("feat: add new feature"),
      dispose: vi.fn(),
    };

    mockGitService = {
      getActiveRepository: vi.fn().mockResolvedValue(mockRepo),
      getStagedDiff: vi.fn().mockResolvedValue("diff --git a/file.ts\n+added line"),
    };

    mockSecretStore = {
      get: vi.fn().mockResolvedValue("sk-test-key"),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      getModelId: vi.fn().mockReturnValue("claude-sonnet-5"),
      setModelId: vi.fn().mockResolvedValue(undefined),
    };

    mockProviderFactory = {
      create: vi.fn().mockReturnValue(mockProvider),
    };
  });

  function makeHandler() {
    return generateHandler(
      mockGitService,
      mockSecretStore,
      mockConfigService,
      mockProviderFactory
    );
  }

  it("generates and sets commit message on the repo", async () => {
    await makeHandler()();

    expect(mockGitService.getStagedDiff).toHaveBeenCalledWith("/test/repo");
    expect(mockProviderFactory.create).toHaveBeenCalledWith(
      "claude-sonnet-5",
      "sk-test-key"
    );
    expect(mockProvider.generate).toHaveBeenCalled();
    expect(mockRepo.setCommitMessage).toHaveBeenCalledWith("feat: add new feature");
  });

  it("disposes the provider after successful generation", async () => {
    await makeHandler()();
    expect(mockProvider.dispose).toHaveBeenCalled();
  });

  it("shows warning and returns when diff is empty/whitespace", async () => {
    vi.mocked(mockGitService.getStagedDiff).mockResolvedValue("   \n  ");

    await makeHandler()();

    expect(mockWindow.showWarningMessage).toHaveBeenCalledWith(
      "No staged changes found. Stage some changes first."
    );
    expect(mockProviderFactory.create).not.toHaveBeenCalled();
  });

  describe("when the selected model is no longer available", () => {
    beforeEach(() => {
      vi.mocked(mockConfigService.getModelId).mockReturnValue("not-a-real-model");
    });

    it("opens the model quick pick naming the unavailable model", async () => {
      await makeHandler()();

      expect(mockWindow.showQuickPick).toHaveBeenCalledOnce();
      const options = mockWindow.showQuickPick.mock.calls[0][1];
      expect(options?.placeHolder).toContain("not-a-real-model");
    });

    it("validates the model before doing any git work", async () => {
      await makeHandler()();

      expect(mockGitService.getActiveRepository).not.toHaveBeenCalled();
      expect(mockGitService.getStagedDiff).not.toHaveBeenCalled();
    });

    it("continues generating with the newly picked model", async () => {
      mockWindow.showQuickPick.mockResolvedValueOnce({
        label: "Claude Haiku 4.5",
        modelId: "claude-haiku-4-5",
      } as ModelQuickPickItem);

      await makeHandler()();

      expect(mockConfigService.setModelId).toHaveBeenCalledWith("claude-haiku-4-5");
      expect(mockProviderFactory.create).toHaveBeenCalledWith(
        "claude-haiku-4-5",
        "sk-test-key"
      );
      expect(mockRepo.setCommitMessage).toHaveBeenCalledWith(
        "feat: add new feature"
      );
    });

    it("returns without generating when the pick is dismissed", async () => {
      mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

      await makeHandler()();

      expect(mockProviderFactory.create).not.toHaveBeenCalled();
      expect(mockRepo.setCommitMessage).not.toHaveBeenCalled();
    });
  });

  describe("when no API key is stored", () => {
    beforeEach(() => {
      vi.mocked(mockSecretStore.get).mockResolvedValue(undefined);
    });

    it("shows a QuickPick offering setKey and changeModel actions", async () => {
      mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

      await makeHandler()();

      expect(mockWindow.showQuickPick).toHaveBeenCalledOnce();
      const [items] = mockWindow.showQuickPick.mock.calls[0];
      const ids = (items as ActionQuickPickItem[]).map((i) => i.id);
      expect(ids).toContain("setKey");
      expect(ids).toContain("changeModel");
    });

    it("executes setModel command and returns when user picks changeModel", async () => {
      const picked: ActionQuickPickItem = {
        id: "changeModel",
        label: "$(arrow-swap) Change Model",
      };
      mockWindow.showQuickPick.mockResolvedValueOnce(picked);

      await makeHandler()();

      expect(mockCommands.executeCommand).toHaveBeenCalledWith(
        "commitMessageGen.setModel"
      );
      expect(mockProviderFactory.create).not.toHaveBeenCalled();
    });

    it("shows InputBox and stores the key when user picks setKey", async () => {
      const picked: ActionQuickPickItem = {
        id: "setKey",
        label: "$(key) Set API Key",
      };
      mockWindow.showQuickPick.mockResolvedValueOnce(picked);
      mockWindow.showInputBox.mockResolvedValueOnce("sk-entered-key");

      await makeHandler()();

      expect(mockSecretStore.store).toHaveBeenCalledWith(
        "commitMessageGen.apiKey.anthropic",
        "sk-entered-key"
      );
      expect(mockProviderFactory.create).toHaveBeenCalledWith(
        "claude-sonnet-5",
        "sk-entered-key"
      );
      expect(mockRepo.setCommitMessage).toHaveBeenCalledWith("feat: add new feature");
    });

    it("returns without generating when user picks setKey but cancels InputBox", async () => {
      const picked: ActionQuickPickItem = {
        id: "setKey",
        label: "$(key) Set API Key",
      };
      mockWindow.showQuickPick.mockResolvedValueOnce(picked);
      mockWindow.showInputBox.mockResolvedValueOnce(undefined);

      await makeHandler()();

      expect(mockProviderFactory.create).not.toHaveBeenCalled();
    });

    it("returns without generating when user dismisses the QuickPick", async () => {
      mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

      await makeHandler()();

      expect(mockProviderFactory.create).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("shows error message when generate throws", async () => {
      vi.mocked(mockProvider.generate).mockRejectedValue(new Error("API rate limit"));

      await makeHandler()();

      expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
        "Failed to generate commit message: API rate limit"
      );
    });

    it("disposes provider even when generate throws", async () => {
      vi.mocked(mockProvider.generate).mockRejectedValue(new Error("fail"));

      await makeHandler()();

      expect(mockProvider.dispose).toHaveBeenCalled();
    });

    it("shows error when getActiveRepository throws", async () => {
      vi.mocked(mockGitService.getActiveRepository).mockRejectedValue(
        new Error("No repository selected")
      );

      await makeHandler()();

      expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
        "Failed to generate commit message: No repository selected"
      );
    });

    it("shows stringified error when a non-Error is thrown", async () => {
      vi.mocked(mockProvider.generate).mockRejectedValue("string error");

      await makeHandler()();

      expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
        "Failed to generate commit message: string error"
      );
    });
  });
});
