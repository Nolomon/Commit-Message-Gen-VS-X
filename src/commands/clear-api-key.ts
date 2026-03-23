import * as vscode from "vscode";
import { ISecretStore, SECRET_KEY_PREFIX } from "../core/ports";
import { getAllProviderIds, PROVIDERS } from "../providers/models";

export function clearApiKeyHandler(
  secretStore: ISecretStore
): () => Promise<void> {
  return async () => {
    const providerIds = getAllProviderIds();

    const items: (vscode.QuickPickItem & { providerId: string })[] = [];
    for (const id of providerIds) {
      const hasKey = await secretStore.get(SECRET_KEY_PREFIX + id);
      if (hasKey) {
        items.push({
          label: PROVIDERS[id].displayName,
          providerId: id,
        });
      }
    }

    if (items.length === 0) {
      vscode.window.showInformationMessage(
        "No API keys are currently stored."
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a provider to clear the API key for",
    });
    if (!picked) {
      return;
    }

    await secretStore.delete(SECRET_KEY_PREFIX + picked.providerId);
    vscode.window.showInformationMessage(
      `API key for ${picked.label} cleared.`
    );
  };
}
