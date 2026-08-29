import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import type { IConfigService } from "../core/ports";
import { setModelHandler } from "../commands/set-model";
import { MODELS } from "../providers/models";

type ModelQuickPickItem = vscode.QuickPickItem & { modelId: string };

describe("setModelHandler", () => {
  let mockConfigService: IConfigService;
  const mockWindow = vi.mocked(vscode.window);

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigService = {
      getModelId: vi.fn().mockReturnValue("claude-sonnet-5"),
      setModelId: vi.fn().mockResolvedValue(undefined),
      shouldFocusMessageBox: vi.fn().mockReturnValue(false),
    };
  });

  function makeHandler() {
    return setModelHandler(mockConfigService);
  }

  it("shows a QuickPick item for every model", async () => {
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    const items = mockWindow.showQuickPick.mock.calls[0][0] as ModelQuickPickItem[];
    expect(items.length).toBe(Object.keys(MODELS).length);
  });

  it("labels each item with the model displayName", async () => {
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    const items = mockWindow.showQuickPick.mock.calls[0][0] as ModelQuickPickItem[];
    for (const item of items) {
      expect(item.label).toBe(MODELS[item.modelId].displayName);
    }
  });

  it("marks the current model with $(check) in the description", async () => {
    vi.mocked(mockConfigService.getModelId).mockReturnValue("claude-sonnet-5");
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    const items = mockWindow.showQuickPick.mock.calls[0][0] as ModelQuickPickItem[];
    const currentItem = items.find(
      (i) => i.modelId === "claude-sonnet-5"
    );
    expect(currentItem?.description).toContain("$(check)");
  });

  it("does not add $(check) to non-current models", async () => {
    vi.mocked(mockConfigService.getModelId).mockReturnValue("claude-sonnet-5");
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    const items = mockWindow.showQuickPick.mock.calls[0][0] as ModelQuickPickItem[];
    const otherItems = items.filter(
      (i) => i.modelId !== "claude-sonnet-5"
    );
    for (const item of otherItems) {
      expect(item.description).not.toContain("$(check)");
    }
  });

  it("returns without updating when user dismisses the QuickPick", async () => {
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    expect(mockConfigService.setModelId).not.toHaveBeenCalled();
    expect(mockWindow.showInformationMessage).not.toHaveBeenCalled();
  });

  it("returns without updating when user picks the already-active model", async () => {
    const picked: ModelQuickPickItem = {
      modelId: "claude-sonnet-5",
      label: MODELS["claude-sonnet-5"].displayName,
    };
    mockWindow.showQuickPick.mockResolvedValueOnce(picked);

    await makeHandler()();

    expect(mockConfigService.setModelId).not.toHaveBeenCalled();
  });

  it("calls setModelId and shows confirmation when user picks a different model", async () => {
    const picked: ModelQuickPickItem = {
      modelId: "gpt-5.6-sol",
      label: MODELS["gpt-5.6-sol"].displayName,
    };
    mockWindow.showQuickPick.mockResolvedValueOnce(picked);

    await makeHandler()();

    expect(mockConfigService.setModelId).toHaveBeenCalledWith("gpt-5.6-sol");
    expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
      `Model set to ${MODELS["gpt-5.6-sol"].displayName}.`
    );
  });
});
