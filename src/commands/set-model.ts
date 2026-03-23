import * as vscode from "vscode";
import { IConfigService } from "../core/ports";
import { MODELS, PROVIDERS } from "../providers/models";

export function setModelHandler(
  configService: IConfigService
): () => Promise<void> {
  return async () => {
    const currentModelId = configService.getModelId();

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

    await configService.setModelId(picked.modelId);
    vscode.window.showInformationMessage(`Model set to ${picked.label}.`);
  };
}
