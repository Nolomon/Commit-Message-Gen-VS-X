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
      shouldFocusMessageBox: vi.fn().mockReturnValue(false),
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
    expect(mockRepo.setCommitMessage).toHaveBeenCalledWith("feat: add new feature", {
      focusInput: false,
    });
  });

  it("focuses the message box when commitMessageGen.focusMessageBox is enabled", async () => {
    vi.mocked(mockConfigService.shouldFocusMessageBox).mockReturnValue(true);

    await makeHandler()();

    expect(mockRepo.setCommitMessage).toHaveBeenCalledWith(
      "feat: add new feature",
      { focusInput: true }
    );
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
        "feat: add new feature",
        { focusInput: false }
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
      expect(mockRepo.setCommitMessage).toHaveBeenCalledWith(
        "feat: add new feature",
        { focusInput: false }
      );
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

    it("unwraps the provider's message from an API error body", async () => {
      vi.mocked(mockProvider.generate).mockRejectedValue(
        new Error(
          '400 {"type":"error","error":{"type":"invalid_request_error","message":"max_tokens is too large"},"request_id":"req_1"}'
        )
      );

      await makeHandler()();

      expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
        "Failed to generate commit message: max_tokens is too large"
      );
    });
  });

  describe("when the provider account is out of credit", () => {
    const creditError = new Error(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CeXEk4wcMKbRox3UUGAHv"}'
    );

    beforeEach(() => {
      vi.mocked(mockProvider.generate).mockRejectedValue(creditError);
    });

    it("shows the provider's message with a billing button instead of the raw body", async () => {
      await makeHandler()();

      expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
        "Claude: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
        "Open Claude Billing"
      );
      const [shown] = mockWindow.showErrorMessage.mock.calls[0];
      expect(shown).not.toContain("request_id");
      expect(shown).not.toContain("invalid_request_error");
    });

    it("opens the provider's billing page when the button is pressed", async () => {
      mockWindow.showErrorMessage.mockResolvedValueOnce("Open Claude Billing");

      await makeHandler()();

      expect(vi.mocked(vscode.env).openExternal).toHaveBeenCalledOnce();
      const [uri] = vi.mocked(vscode.env).openExternal.mock.calls[0];
      expect(uri.toString()).toBe("https://console.anthropic.com/settings/billing");
    });

    it("does not open anything when the notification is dismissed", async () => {
      mockWindow.showErrorMessage.mockResolvedValueOnce(undefined);

      await makeHandler()();

      expect(vi.mocked(vscode.env).openExternal).not.toHaveBeenCalled();
    });

    it("links the billing page of the provider that actually failed", async () => {
      vi.mocked(mockConfigService.getModelId).mockReturnValue("deepseek-v4-flash");
      vi.mocked(mockProvider.generate).mockRejectedValue(
        new Error(
          'API request failed (402): {"error":{"message":"Insufficient Balance","type":"unknown_error"}}'
        )
      );
      mockWindow.showErrorMessage.mockResolvedValueOnce("Open DeepSeek Billing");

      await makeHandler()();

      expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
        "DeepSeek: Insufficient Balance",
        "Open DeepSeek Billing"
      );
      const [uri] = vi.mocked(vscode.env).openExternal.mock.calls[0];
      expect(uri.toString()).toBe("https://platform.deepseek.com/top_up");
    });

    it("falls back to the plain error when it failed before a provider was chosen", async () => {
      vi.mocked(mockGitService.getStagedDiff).mockRejectedValue(creditError);

      await makeHandler()();

      expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Failed to generate commit message:")
      );
      expect(vi.mocked(vscode.env).openExternal).not.toHaveBeenCalled();
    });
  });
});
