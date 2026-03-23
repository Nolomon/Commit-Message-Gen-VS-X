import * as vscode from "vscode";
import { ConfigService } from "./infrastructure/config-service";
import { setApiKeyHandler } from "./commands/set-api-key";
import { clearApiKeyHandler } from "./commands/clear-api-key";
import { setModelHandler } from "./commands/set-model";
import { generateHandler } from "./commands/generate";

export function activate(context: vscode.ExtensionContext) {
  const configService = new ConfigService();
  const secrets = context.secrets;

  const commands: [string, () => Promise<void>][] = [
    ["commitMessageGen.setApiKey", setApiKeyHandler(secrets)],
    ["commitMessageGen.clearApiKey", clearApiKeyHandler(secrets)],
    ["commitMessageGen.setModel", setModelHandler(configService)],
    ["commitMessageGen.generate", generateHandler(secrets, configService)],
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
