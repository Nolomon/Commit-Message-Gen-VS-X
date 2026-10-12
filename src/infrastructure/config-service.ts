import * as vscode from "vscode";
import { Disposable, IConfigService, IDraftConfig } from "../core/ports";
import { DEFAULT_MODEL_ID } from "../providers/models";

const SECTION = "commitMessageGen";

export class ConfigService implements IConfigService, IDraftConfig {
  getModelId(): string {
    return vscode.workspace
      .getConfiguration(SECTION)
      .get<string>("model", DEFAULT_MODEL_ID);
  }

  shouldFocusMessageBox(): boolean {
    return vscode.workspace
      .getConfiguration(SECTION)
      .get<boolean>("focusMessageBox", false);
  }

  isDraftFileEnabled(): boolean {
    return vscode.workspace
      .getConfiguration(SECTION)
      .get<boolean>("draftFile.enabled", true);
  }

  onDidChangeDraftFileEnabled(listener: () => void): Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${SECTION}.draftFile.enabled`)) {
        listener();
      }
    });
  }

  async setModelId(modelId: string): Promise<void> {
    await vscode.workspace
      .getConfiguration(SECTION)
      .update("model", modelId, vscode.ConfigurationTarget.Global);
  }
}
