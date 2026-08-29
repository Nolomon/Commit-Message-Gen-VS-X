import * as vscode from "vscode";
import { IConfigService, IGitService, IProviderFactory, ISecretStore, SECRET_KEY_PREFIX } from "../core/ports";
import { getProviderForModel } from "../providers/models";
import { pickModel } from "./set-model";

export function generateHandler(
  gitService: IGitService,
  secretStore: ISecretStore,
  configService: IConfigService,
  providerFactory: IProviderFactory
): () => Promise<void> {
  return async () => {
    try {
      // Validated before any git work: the lookup is free, and a selected model
      // that has been retired would otherwise cost a full staged-diff read on
      // every press before failing.
      let modelId = configService.getModelId();
      let info = getProviderForModel(modelId);
      if (!info) {
        const picked = await pickModel(
          configService,
          `"${modelId}" is no longer available — select a model`
        );
        if (!picked) {
          return;
        }
        modelId = picked;
        info = getProviderForModel(modelId);
        if (!info) {
          return;
        }
      }

      const repo = await gitService.getActiveRepository();

      const diff = await gitService.getStagedDiff(repo.rootPath);
      if (!diff.trim()) {
        vscode.window.showWarningMessage(
          "No staged changes found. Stage some changes first."
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

        repo.setCommitMessage(message);
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
