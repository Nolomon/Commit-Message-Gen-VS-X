import { IConfigService } from "./ports";
import { MODELS, getReplacementModel } from "../providers/models";

export interface ModelMigration {
  from: string;
  to: string;
  toDisplayName: string;
}

/**
 * Move a retired model selection onto its current equivalent.
 *
 * Returns the migration that was applied, or undefined if the selected model is
 * still current or has no known replacement (in which case generation reports
 * the unknown model as before).
 */
export async function migrateModelSetting(
  configService: IConfigService
): Promise<ModelMigration | undefined> {
  const current = configService.getModelId();
  const replacement = getReplacementModel(current);
  if (!replacement) {
    return undefined;
  }

  await configService.setModelId(replacement);
  return {
    from: current,
    to: replacement,
    toDisplayName: MODELS[replacement].displayName,
  };
}
