import { describe, it, expect, vi } from "vitest";
import { migrateModelSetting } from "../core/migrate-model-setting";
import { IConfigService } from "../core/ports";
import { MODELS, RETIRED_MODEL_REPLACEMENTS } from "../providers/models";

function mockConfigService(modelId: string): IConfigService {
  return {
    getModelId: vi.fn(() => modelId),
    setModelId: vi.fn(() => Promise.resolve()),
    shouldFocusMessageBox: vi.fn(() => false),
  };
}

describe("migrateModelSetting", () => {
  it("moves a retired model onto its replacement and persists it", async () => {
    const configService = mockConfigService("claude-sonnet-4-6");

    const migration = await migrateModelSetting(configService);

    expect(migration).toEqual({
      from: "claude-sonnet-4-6",
      to: "claude-sonnet-5",
      toDisplayName: "Claude Sonnet 5",
    });
    expect(configService.setModelId).toHaveBeenCalledWith("claude-sonnet-5");
  });

  it("migrates a model retired several versions ago", async () => {
    const configService = mockConfigService("gemini-2.0-flash");

    const migration = await migrateModelSetting(configService);

    expect(migration?.to).toBe("gemini-3.7-flash");
    expect(configService.setModelId).toHaveBeenCalledWith("gemini-3.7-flash");
  });

  it("leaves a current model alone", async () => {
    const configService = mockConfigService("claude-sonnet-5");

    const migration = await migrateModelSetting(configService);

    expect(migration).toBeUndefined();
    expect(configService.setModelId).not.toHaveBeenCalled();
  });

  it("leaves an unrecognized model alone so generation reports it", async () => {
    const configService = mockConfigService("some-model-we-never-shipped");

    const migration = await migrateModelSetting(configService);

    expect(migration).toBeUndefined();
    expect(configService.setModelId).not.toHaveBeenCalled();
  });
});

describe("RETIRED_MODEL_REPLACEMENTS", () => {
  it("every replacement target is a current model", () => {
    for (const [retired, replacement] of Object.entries(
      RETIRED_MODEL_REPLACEMENTS
    )) {
      expect(
        MODELS[replacement],
        `"${retired}" points at unknown model "${replacement}"`
      ).toBeDefined();
    }
  });

  it("no retired ID is also a current model", () => {
    for (const retired of Object.keys(RETIRED_MODEL_REPLACEMENTS)) {
      expect(
        MODELS[retired],
        `"${retired}" is listed as retired but still ships`
      ).toBeUndefined();
    }
  });

  it("covers every model the extension has previously shipped", () => {
    // Guards against dropping a model from MODELS without giving upgrading
    // users somewhere to land.
    const previouslyShipped = [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "gpt-4.1",
      "gpt-4.1-mini",
      "o4-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "deepseek-chat",
      "deepseek-reasoner",
      "mistral-large-latest",
    ];
    for (const modelId of previouslyShipped) {
      expect(
        RETIRED_MODEL_REPLACEMENTS[modelId],
        `no replacement for previously shipped "${modelId}"`
      ).toBeDefined();
    }
  });
});
