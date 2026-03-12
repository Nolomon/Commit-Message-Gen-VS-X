import * as vscode from "vscode";
import { getGitAPI, getActiveRepository, getStagedDiff } from "./git";
import { createProvider } from "./providers/factory";
import {
  getProviderForModel,
  getAllProviderIds,
  PROVIDERS,
  MODELS,
} from "./providers/models";

const SECRET_KEY_PREFIX = "commitMessageGen.apiKey.";

export function activate(context: vscode.ExtensionContext) {
  // Command: Set / Update API Key
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "commitMessageGen.setApiKey",
      async () => {
        const providerIds = getAllProviderIds();

        const items: (vscode.QuickPickItem & { providerId: string })[] = [];
        for (const id of providerIds) {
          const hasKey = await context.secrets.get(SECRET_KEY_PREFIX + id);
          items.push({
            label: PROVIDERS[id].displayName,
            description: hasKey ? "$(check) API key set" : "$(circle-slash) No API key",
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
          await context.secrets.store(
            SECRET_KEY_PREFIX + picked.providerId,
            key
          );
          vscode.window.showInformationMessage(
            `API key for ${picked.label} saved securely.`
          );
        }
      }
    )
  );

  // Command: Clear API Key
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "commitMessageGen.clearApiKey",
      async () => {
        const providerIds = getAllProviderIds();

        const items: (vscode.QuickPickItem & { providerId: string })[] = [];
        for (const id of providerIds) {
          const hasKey = await context.secrets.get(SECRET_KEY_PREFIX + id);
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

        await context.secrets.delete(SECRET_KEY_PREFIX + picked.providerId);
        vscode.window.showInformationMessage(
          `API key for ${picked.label} cleared.`
        );
      }
    )
  );

  // Command: Set Model
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "commitMessageGen.setModel",
      async () => {
        const config =
          vscode.workspace.getConfiguration("commitMessageGen");
        const currentModelId = config.get<string>(
          "model",
          "claude-sonnet-4-6"
        );

        const items: (vscode.QuickPickItem & { modelId: string })[] =
          Object.entries(MODELS).map(([id, model]) => ({
            label: model.displayName,
            description:
              PROVIDERS[model.provider].displayName +
              (id === currentModelId ? " $(check)" : ""),
            modelId: id,
          }));

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: "Select a model for commit message generation",
        });
        if (!picked || picked.modelId === currentModelId) {
          return;
        }

        await config.update(
          "model",
          picked.modelId,
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(
          `Model set to ${picked.label}.`
        );
      }
    )
  );

  // Command: Generate Commit Message
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "commitMessageGen.generate",
      async () => {
        try {
          const git = await getGitAPI();
          const repo = await getActiveRepository(git);

          // Get staged diff
          const diff = await getStagedDiff(repo.rootUri.fsPath);
          if (!diff.trim()) {
            vscode.window.showWarningMessage(
              "No staged changes found. Stage some changes first."
            );
            return;
          }

          // Read model from configuration
          const config =
            vscode.workspace.getConfiguration("commitMessageGen");
          const modelId = config.get<string>("model", "claude-sonnet-4-6");

          // Resolve provider from model
          const info = getProviderForModel(modelId);
          if (!info) {
            vscode.window.showErrorMessage(
              `Unknown model "${modelId}". Check your commitMessageGen.model setting.`
            );
            return;
          }

          const { providerId, provider: providerInfo } = info;

          // Get API key from secret storage
          let apiKey = await context.secrets.get(
            SECRET_KEY_PREFIX + providerId
          );
          if (!apiKey) {
            const action = await vscode.window.showWarningMessage(
              `No API key set for ${providerInfo.displayName}. Would you like to set one now?`,
              { modal: true },
              "Set API Key",
              "Change Model"
            );
            if (action === "Change Model") {
              vscode.commands.executeCommand("commitMessageGen.setModel");
              return;
            }
            if (action === "Set API Key") {
              const key = await vscode.window.showInputBox({
                prompt: `Enter your ${providerInfo.displayName} API key`,
                password: true,
                ignoreFocusOut: true,
                placeHolder: "Enter API key...",
              });
              if (key) {
                await context.secrets.store(
                  SECRET_KEY_PREFIX + providerId,
                  key
                );
                apiKey = key;
              }
            }
            if (!apiKey) {
              return;
            }
          }

          // Generate with progress
          const provider = createProvider(modelId, apiKey);

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
          const msg =
            error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(
            `Failed to generate commit message: ${msg}`
          );
        }
      }
    )
  );
}

export function deactivate() {
  // Nothing to clean up
}
