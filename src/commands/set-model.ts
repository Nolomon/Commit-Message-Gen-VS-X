import * as vscode from "vscode";
import { IConfigService } from "../core/ports";
import { MODELS, PROVIDERS } from "../providers/models";

export const DEFAULT_PICK_PLACEHOLDER =
  "Select a model for commit message generation";

/**
 * Show the model quick pick and persist the choice.
 *
 * Returns the newly selected model ID, or undefined if the user dismissed the
 * pick or chose the model that was already active.
 */
export async function pickModel(
  configService: IConfigService,
  placeHolder: string = DEFAULT_PICK_PLACEHOLDER
): Promise<string | undefined> {
  const currentModelId = configService.getModelId();

  const items: (vscode.QuickPickItem & { modelId: string })[] =
    Object.entries(MODELS).map(([id, model]) => ({
      label: model.displayName,
      description:
        PROVIDERS[model.provider].displayName +
        (id === currentModelId ? " $(check)" : ""),
      modelId: id,
    }));

  const picked = await vscode.window.showQuickPick(items, { placeHolder });
  if (!picked || picked.modelId === currentModelId) {
    return undefined;
  }

  await configService.setModelId(picked.modelId);
  vscode.window.showInformationMessage(`Model set to ${picked.label}.`);
  return picked.modelId;
}

export function setModelHandler(
  configService: IConfigService
): () => Promise<void> {
  return async () => {
    await pickModel(configService);
  };
}
