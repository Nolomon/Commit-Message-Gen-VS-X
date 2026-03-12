import { describe, it, expect } from "vitest";
import {
  DEFAULT_MODEL_ID,
  PROVIDERS,
  MODELS,
  getProviderForModel,
  getAllProviderIds,
  type ProviderId,
} from "../providers/models";

describe("constants", () => {
  it("DEFAULT_MODEL_ID is claude-sonnet-4-6", () => {
    expect(DEFAULT_MODEL_ID).toBe("claude-sonnet-4-6");
  });

  it("DEFAULT_MODEL_ID exists in MODELS", () => {
    expect(MODELS[DEFAULT_MODEL_ID]).toBeDefined();
  });

  it("MODELS contains exactly 12 entries", () => {
    expect(Object.keys(MODELS)).toHaveLength(12);
  });

  it("PROVIDERS contains exactly 5 entries", () => {
    expect(Object.keys(PROVIDERS)).toHaveLength(5);
  });
});

describe("data integrity", () => {
  it("every model references a valid provider", () => {
    for (const [id, model] of Object.entries(MODELS)) {
      expect(PROVIDERS[model.provider], `model "${id}" references unknown provider "${model.provider}"`).toBeDefined();
    }
  });

  it("all models have non-empty displayName", () => {
    for (const [id, model] of Object.entries(MODELS)) {
      expect(model.displayName, `model "${id}" has empty displayName`).toBeTruthy();
    }
  });

  it("all providers have non-empty displayName", () => {
    for (const [id, provider] of Object.entries(PROVIDERS)) {
      expect(provider.displayName, `provider "${id}" has empty displayName`).toBeTruthy();
    }
  });

  it("OpenAI-compatible providers have baseUrl", () => {
    expect(PROVIDERS.openai.baseUrl).toBeTruthy();
    expect(PROVIDERS.deepseek.baseUrl).toBeTruthy();
    expect(PROVIDERS.mistral.baseUrl).toBeTruthy();
  });

  it("anthropic and google providers do not have baseUrl", () => {
    expect(PROVIDERS.anthropic.baseUrl).toBeUndefined();
    expect(PROVIDERS.google.baseUrl).toBeUndefined();
  });
});

describe("getProviderForModel", () => {
  it("returns correct info for an Anthropic model", () => {
    const result = getProviderForModel("claude-sonnet-4-6");
    expect(result).toBeDefined();
    expect(result!.providerId).toBe("anthropic");
    expect(result!.provider).toBe(PROVIDERS.anthropic);
    expect(result!.model).toBe(MODELS["claude-sonnet-4-6"]);
  });

  it("returns correct info for an OpenAI model", () => {
    const result = getProviderForModel("gpt-4o");
    expect(result).toBeDefined();
    expect(result!.providerId).toBe("openai");
  });

  it("returns correct info for a Google model", () => {
    const result = getProviderForModel("gemini-2.0-flash");
    expect(result).toBeDefined();
    expect(result!.providerId).toBe("google");
  });

  it("returns correct info for a DeepSeek model", () => {
    const result = getProviderForModel("deepseek-chat");
    expect(result).toBeDefined();
    expect(result!.providerId).toBe("deepseek");
  });

  it("returns correct info for a Mistral model", () => {
    const result = getProviderForModel("mistral-large-latest");
    expect(result).toBeDefined();
    expect(result!.providerId).toBe("mistral");
  });

  it("returns undefined for unknown model", () => {
    expect(getProviderForModel("nonexistent-model")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getProviderForModel("")).toBeUndefined();
  });
});

describe("getAllProviderIds", () => {
  it("returns all five provider IDs", () => {
    const ids = getAllProviderIds();
    const expected: ProviderId[] = ["anthropic", "openai", "google", "deepseek", "mistral"];
    expect(ids).toEqual(expect.arrayContaining(expected));
    expect(expected).toEqual(expect.arrayContaining(ids));
  });

  it("returns correct count", () => {
    expect(getAllProviderIds()).toHaveLength(5);
  });
});
