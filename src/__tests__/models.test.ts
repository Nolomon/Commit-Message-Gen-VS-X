import { describe, it, expect } from "vitest";
import {
  DEFAULT_MODEL_ID,
  PROVIDERS,
  MODELS,
  getProviderForModel,
  getAllProviderIds,
  type ProviderId,
} from "../providers/models";
import packageJson from "../../package.json";

describe("constants", () => {
  it("DEFAULT_MODEL_ID is claude-sonnet-5", () => {
    expect(DEFAULT_MODEL_ID).toBe("claude-sonnet-5");
  });

  it("DEFAULT_MODEL_ID exists in MODELS", () => {
    expect(MODELS[DEFAULT_MODEL_ID]).toBeDefined();
  });

  it("MODELS contains exactly 13 entries", () => {
    expect(Object.keys(MODELS)).toHaveLength(13);
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

  it("each OpenAI-compatible provider uses the token param its API expects", () => {
    expect(PROVIDERS.openai.tokenParam).toBe("max_completion_tokens");
    expect(PROVIDERS.deepseek.tokenParam).toBe("max_tokens");
    expect(PROVIDERS.mistral.tokenParam).toBe("max_tokens");
  });

  it("reasoning models are tuned down, and models that reject tuning have none", () => {
    // Reasoning tokens count against MAX_TOKENS, so every model that reasons by
    // default must ask for the minimum. Haiku 4.5 predates `effort` and 400s on it.
    expect(MODELS["claude-sonnet-5"].requestOptions).toEqual({
      output_config: { effort: "low" },
    });
    expect(MODELS["gpt-5.6-sol"].requestOptions).toEqual({
      reasoning_effort: "none",
    });
    expect(MODELS["gemini-3.7-flash"].requestOptions).toEqual({
      generationConfig: { thinkingLevel: "minimal" },
    });
    expect(MODELS["deepseek-v4-flash"].requestOptions).toEqual({
      thinking: { type: "disabled" },
    });
    expect(MODELS["claude-haiku-4-5"].requestOptions).toBeUndefined();
  });
});

describe("package.json configuration schema", () => {
  const config = packageJson.contributes.configuration.properties[
    "commitMessageGen.model"
  ] as {
    enum: string[];
    enumItemLabels: string[];
    markdownEnumDescriptions: string[];
    default: string;
  };

  it("enum lists exactly the models in MODELS, in the same order", () => {
    expect(config.enum).toEqual(Object.keys(MODELS));
  });

  it("the three parallel arrays stay index-aligned", () => {
    expect(config.enumItemLabels).toHaveLength(config.enum.length);
    expect(config.markdownEnumDescriptions).toHaveLength(config.enum.length);
  });

  it("default matches DEFAULT_MODEL_ID", () => {
    expect(config.default).toBe(DEFAULT_MODEL_ID);
  });
});

describe("getProviderForModel", () => {
  it("returns correct info for an Anthropic model", () => {
    const result = getProviderForModel("claude-sonnet-5");
    expect(result).toBeDefined();
    expect(result!.providerId).toBe("anthropic");
    expect(result!.provider).toBe(PROVIDERS.anthropic);
    expect(result!.model).toBe(MODELS["claude-sonnet-5"]);
  });

  it("returns correct info for an OpenAI model", () => {
    const result = getProviderForModel("gpt-5.6-sol");
    expect(result).toBeDefined();
    expect(result!.providerId).toBe("openai");
  });

  it("returns correct info for a Google model", () => {
    const result = getProviderForModel("gemini-3.7-flash");
    expect(result).toBeDefined();
    expect(result!.providerId).toBe("google");
  });

  it("returns correct info for a DeepSeek model", () => {
    const result = getProviderForModel("deepseek-v4-flash");
    expect(result).toBeDefined();
    expect(result!.providerId).toBe("deepseek");
  });

  it("returns correct info for a Mistral model", () => {
    const result = getProviderForModel("mistral-medium-latest");
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
