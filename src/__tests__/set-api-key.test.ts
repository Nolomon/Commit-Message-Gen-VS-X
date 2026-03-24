import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import type { ISecretStore } from "../core/ports";
import { SECRET_KEY_PREFIX } from "../core/ports";
import { setApiKeyHandler } from "../commands/set-api-key";
import { getAllProviderIds, PROVIDERS, type ProviderId } from "../providers/models";

type ProviderQuickPickItem = vscode.QuickPickItem & { providerId: ProviderId };

describe("setApiKeyHandler", () => {
  let mockSecretStore: ISecretStore;
  const mockWindow = vi.mocked(vscode.window);

  beforeEach(() => {
    vi.clearAllMocks();
    mockSecretStore = {
      get: vi.fn().mockResolvedValue(undefined),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
  });

  function makeHandler() {
    return setApiKeyHandler(mockSecretStore);
  }

  it("shows a QuickPick item for every provider", async () => {
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    const items = mockWindow.showQuickPick.mock.calls[0][0] as ProviderQuickPickItem[];
    expect(items.length).toBe(getAllProviderIds().length);
  });

  it("labels each item with the provider displayName", async () => {
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    const items = mockWindow.showQuickPick.mock.calls[0][0] as ProviderQuickPickItem[];
    for (const item of items) {
      expect(item.label).toBe(PROVIDERS[item.providerId].displayName);
    }
  });

  it("shows '$(check) API key set' for providers that have a stored key", async () => {
    const [firstId] = getAllProviderIds();
    vi.mocked(mockSecretStore.get).mockImplementation((key) =>
      key === SECRET_KEY_PREFIX + firstId ? Promise.resolve("stored") : Promise.resolve(undefined)
    );
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    const items = mockWindow.showQuickPick.mock.calls[0][0] as ProviderQuickPickItem[];
    const firstItem = items.find((i) => i.providerId === firstId)!;
    expect(firstItem.description).toContain("$(check) API key set");
  });

  it("shows '$(circle-slash) No API key' for providers without a stored key", async () => {
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    const items = mockWindow.showQuickPick.mock.calls[0][0] as ProviderQuickPickItem[];
    for (const item of items) {
      expect(item.description).toContain("$(circle-slash) No API key");
    }
  });

  it("returns without storing when user dismisses the provider QuickPick", async () => {
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    expect(mockSecretStore.store).not.toHaveBeenCalled();
    expect(mockWindow.showInputBox).not.toHaveBeenCalled();
  });

  it("shows an InputBox after the user picks a provider", async () => {
    const [providerId] = getAllProviderIds();
    const picked: ProviderQuickPickItem = {
      label: PROVIDERS[providerId].displayName,
      providerId,
    };
    mockWindow.showQuickPick.mockResolvedValueOnce(picked);
    mockWindow.showInputBox.mockResolvedValueOnce(undefined);

    await makeHandler()();

    expect(mockWindow.showInputBox).toHaveBeenCalledOnce();
    const opts = mockWindow.showInputBox.mock.calls[0][0] as vscode.InputBoxOptions;
    expect(opts.password).toBe(true);
  });

  it("stores the key and shows a confirmation when the user enters a key", async () => {
    const [providerId] = getAllProviderIds();
    const picked: ProviderQuickPickItem = {
      label: PROVIDERS[providerId].displayName,
      providerId,
    };
    mockWindow.showQuickPick.mockResolvedValueOnce(picked);
    mockWindow.showInputBox.mockResolvedValueOnce("sk-my-new-key");

    await makeHandler()();

    expect(mockSecretStore.store).toHaveBeenCalledWith(
      SECRET_KEY_PREFIX + providerId,
      "sk-my-new-key"
    );
    expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("saved securely")
    );
  });

  it("does not store when the user cancels the InputBox", async () => {
    const [providerId] = getAllProviderIds();
    const picked: ProviderQuickPickItem = {
      label: PROVIDERS[providerId].displayName,
      providerId,
    };
    mockWindow.showQuickPick.mockResolvedValueOnce(picked);
    mockWindow.showInputBox.mockResolvedValueOnce(undefined);

    await makeHandler()();

    expect(mockSecretStore.store).not.toHaveBeenCalled();
    expect(mockWindow.showInformationMessage).not.toHaveBeenCalled();
  });
});
