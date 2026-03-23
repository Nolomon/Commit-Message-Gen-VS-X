import * as vscode from "vscode";
import { IConfigService, IProviderFactory, ISecretStore, SECRET_KEY_PREFIX } from "../core/ports";
import { getGitAPI, getActiveRepository, getStagedDiff } from "../git";
import { getProviderForModel } from "../providers/models";

export function generateHandler(
  secretStore: ISecretStore,
  configService: IConfigService,
  providerFactory: IProviderFactory
): () => Promise<void> {
  return async () => {
    try {
      const git = await getGitAPI();
      const repo = await getActiveRepository(git);

      const diff = await getStagedDiff(repo.rootUri.fsPath);
      if (!diff.trim()) {
        vscode.window.showWarningMessage(
          "No staged changes found. Stage some changes first."
        );
        return;
      }

      const modelId = configService.getModelId();

      const info = getProviderForModel(modelId);
      if (!info) {
        vscode.window.showErrorMessage(
          `Unknown model "${modelId}". Check your commitMessageGen.model setting.`
        );
        return;
      }

      const { providerId, provider: providerInfo } = info;

      let apiKey = await secretStore.get(SECRET_KEY_PREFIX + providerId);
      if (!apiKey) {
        const action = await vscode.window.showQuickPick(
          [
            {
              label: "$(key) Set API Key",
              id: "setKey",
              description: `Enter your ${providerInfo.displayName} key`,
            },
            {
              label: "$(arrow-swap) Change Model",
              id: "changeModel",
              description: "Switch to a different model",
            },
          ],
          {
            placeHolder: `No API key set for ${providerInfo.displayName}`,
          }
        );
        if (action?.id === "changeModel") {
          vscode.commands.executeCommand("commitMessageGen.setModel");
          return;
        }
        if (action?.id === "setKey") {
          const key = await vscode.window.showInputBox({
            prompt: `Enter your ${providerInfo.displayName} API key`,
            password: true,
            ignoreFocusOut: true,
            placeHolder: "Enter API key...",
          });
          if (key) {
            await secretStore.store(SECRET_KEY_PREFIX + providerId, key);
            apiKey = key;
          }
        }
        if (!apiKey) {
          return;
        }
      }

      const provider = providerFactory.create(modelId, apiKey);

      try {
        const message = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.SourceControl,
            title: "Generating commit message...",
            cancellable: false,
          },
          async () => {
            return provider.generate(diff);
          }
        );

        repo.inputBox.value = message;
      } finally {
        provider.dispose();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Failed to generate commit message: ${msg}`
      );
    }
  };
}
