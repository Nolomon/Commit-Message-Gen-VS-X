import * as vscode from "vscode";
import { ISecretStore, SECRET_KEY_PREFIX } from "../core/ports";
import { getAllProviderIds, PROVIDERS } from "../providers/models";

export function setApiKeyHandler(
  secretStore: ISecretStore
): () => Promise<void> {
  return async () => {
    const providerIds = getAllProviderIds();

    const items: (vscode.QuickPickItem & { providerId: string })[] = [];
    for (const id of providerIds) {
      const hasKey = await secretStore.get(SECRET_KEY_PREFIX + id);
      items.push({
        label: PROVIDERS[id].displayName,
        description: hasKey
          ? "$(check) API key set"
          : "$(circle-slash) No API key",
        providerId: id,
      });
    }

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a provider to set the API key for",
    });
    if (!picked) {
      return;
    }

    const key = await vscode.window.showInputBox({
      prompt: `Enter your API key for ${picked.label}`,
      password: true,
      ignoreFocusOut: true,
      placeHolder: "Enter API key...",
    });

    if (key) {
      await secretStore.store(SECRET_KEY_PREFIX + picked.providerId, key);
      vscode.window.showInformationMessage(
        `API key for ${picked.label} saved securely.`
      );
    }
  };
}
