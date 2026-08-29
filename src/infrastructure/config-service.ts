import * as vscode from "vscode";
import { IConfigService } from "../core/ports";
import { DEFAULT_MODEL_ID } from "../providers/models";

const SECTION = "commitMessageGen";

export class ConfigService implements IConfigService {
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

  async setModelId(modelId: string): Promise<void> {
    await vscode.workspace
      .getConfiguration(SECTION)
      .update("model", modelId, vscode.ConfigurationTarget.Global);
  }
}
