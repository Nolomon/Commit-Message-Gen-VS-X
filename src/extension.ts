import * as vscode from "vscode";
import { ConfigService } from "./infrastructure/config-service";
import { SecretStore } from "./infrastructure/secret-store";
import { ProviderFactory } from "./infrastructure/provider-factory";
import { setApiKeyHandler } from "./commands/set-api-key";
import { clearApiKeyHandler } from "./commands/clear-api-key";
import { setModelHandler } from "./commands/set-model";
import { generateHandler } from "./commands/generate";

export function activate(context: vscode.ExtensionContext) {
  const configService = new ConfigService();
  const secretStore = new SecretStore(context.secrets);
  const providerFactory = new ProviderFactory();

  const commands: [string, () => Promise<void>][] = [
    ["commitMessageGen.setApiKey", setApiKeyHandler(secretStore)],
    ["commitMessageGen.clearApiKey", clearApiKeyHandler(secretStore)],
    ["commitMessageGen.setModel", setModelHandler(configService)],
    ["commitMessageGen.generate", generateHandler(secretStore, configService, providerFactory)],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, handler)
    );
  }
}

export function deactivate() {
  // Nothing to clean up
}
