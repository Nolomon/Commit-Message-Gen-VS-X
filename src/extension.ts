import * as vscode from "vscode";
import { getGitAPI, getActiveRepository, getStagedDiff } from "./git";
import { createProvider } from "./providers/factory";

const SECRET_KEY_PREFIX = "commitMessageGen.apiKey.";

export function activate(context: vscode.ExtensionContext) {
  // Command: Set API Key
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "commitMessageGen.setApiKey",
      async () => {
        const config = vscode.workspace.getConfiguration("commitMessageGen");
        const provider = config.get<string>("provider", "anthropic");

        const key = await vscode.window.showInputBox({
          prompt: `Enter your API key for ${provider}`,
          password: true,
          ignoreFocusOut: true,
          placeHolder: "sk-...",
        });

        if (key) {
          await context.secrets.store(SECRET_KEY_PREFIX + provider, key);
          vscode.window.showInformationMessage(
            `API key for ${provider} saved securely.`
          );
        }
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

          // Read configuration
          const config =
            vscode.workspace.getConfiguration("commitMessageGen");
          const providerName = config.get<string>("provider", "anthropic");
          const model = config.get<string>("model", "claude-sonnet-4-6");

          // Get API key from secret storage
          let apiKey = await context.secrets.get(
            SECRET_KEY_PREFIX + providerName
          );
          if (!apiKey) {
            const setNow = await vscode.window.showWarningMessage(
              `No API key found for ${providerName}. Would you like to set one now?`,
              "Set API Key",
              "Cancel"
            );
            if (setNow === "Set API Key") {
              await vscode.commands.executeCommand(
                "commitMessageGen.setApiKey"
              );
              apiKey = await context.secrets.get(
                SECRET_KEY_PREFIX + providerName
              );
            }
            if (!apiKey) {
              return;
            }
          }

          // Generate with progress
          const provider = createProvider(providerName, model, apiKey);

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
