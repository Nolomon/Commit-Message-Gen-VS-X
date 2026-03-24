import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import type { ISecretStore } from "../core/ports";
import { SECRET_KEY_PREFIX } from "../core/ports";
import { clearApiKeyHandler } from "../commands/clear-api-key";
import { getAllProviderIds, PROVIDERS } from "../providers/models";

type ProviderQuickPickItem = vscode.QuickPickItem & { providerId: string };

describe("clearApiKeyHandler", () => {
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
    return clearApiKeyHandler(mockSecretStore);
  }

  it("shows an info message and skips QuickPick when no keys are stored", async () => {
    await makeHandler()();

    expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
      "No API keys are currently stored."
    );
    expect(mockWindow.showQuickPick).not.toHaveBeenCalled();
  });

  it("shows only providers that have a stored key in the QuickPick", async () => {
    const allIds = getAllProviderIds();
    const storedId = allIds[0];
    vi.mocked(mockSecretStore.get).mockImplementation((key) =>
      key === SECRET_KEY_PREFIX + storedId
        ? Promise.resolve("stored-key")
        : Promise.resolve(undefined)
    );
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    const items = mockWindow.showQuickPick.mock.calls[0][0] as ProviderQuickPickItem[];
    expect(items.length).toBe(1);
    expect(items[0].providerId).toBe(storedId);
  });

  it("shows all providers in QuickPick when all have stored keys", async () => {
    vi.mocked(mockSecretStore.get).mockResolvedValue("stored-key");
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    const items = mockWindow.showQuickPick.mock.calls[0][0] as ProviderQuickPickItem[];
    expect(items.length).toBe(getAllProviderIds().length);
  });

  it("returns without deleting when the user dismisses the QuickPick", async () => {
    vi.mocked(mockSecretStore.get).mockResolvedValue("stored-key");
    mockWindow.showQuickPick.mockResolvedValueOnce(undefined);

    await makeHandler()();

    expect(mockSecretStore.delete).not.toHaveBeenCalled();
  });

  it("deletes the key and shows confirmation when the user picks a provider", async () => {
    const [providerId] = getAllProviderIds();
    vi.mocked(mockSecretStore.get).mockImplementation((key) =>
      key === SECRET_KEY_PREFIX + providerId
        ? Promise.resolve("stored-key")
        : Promise.resolve(undefined)
    );
    const picked: ProviderQuickPickItem = {
      label: PROVIDERS[providerId].displayName,
      providerId,
    };
    mockWindow.showQuickPick.mockResolvedValueOnce(picked);

    await makeHandler()();

    expect(mockSecretStore.delete).toHaveBeenCalledWith(
      SECRET_KEY_PREFIX + providerId
    );
    expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("cleared")
    );
  });

  it("deletes only the selected provider's key, not others", async () => {
    const [firstId, secondId] = getAllProviderIds();
    vi.mocked(mockSecretStore.get).mockResolvedValue("stored-key");
    const picked: ProviderQuickPickItem = {
      label: PROVIDERS[firstId].displayName,
      providerId: firstId,
    };
    mockWindow.showQuickPick.mockResolvedValueOnce(picked);

    await makeHandler()();

    expect(mockSecretStore.delete).toHaveBeenCalledTimes(1);
    expect(mockSecretStore.delete).toHaveBeenCalledWith(
      SECRET_KEY_PREFIX + firstId
    );
    expect(mockSecretStore.delete).not.toHaveBeenCalledWith(
      SECRET_KEY_PREFIX + secondId
    );
  });
});
