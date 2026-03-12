import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn(function (this: any) {
    this.messages = { create: vi.fn() };
  });
  return { default: MockAnthropic };
});

import { createProvider } from "../providers/factory";
import { ClaudeProvider } from "../providers/claude";
import { OpenAICompatibleProvider } from "../providers/openai-compatible";
import { GeminiProvider } from "../providers/gemini";
import { PROVIDERS } from "../providers/models";

describe("createProvider", () => {
  it("returns ClaudeProvider for anthropic models", () => {
    const provider = createProvider("claude-sonnet-4-6", "test-key");
    expect(provider).toBeInstanceOf(ClaudeProvider);
    expect(provider.name).toBe("Anthropic Claude");
  });

  it("returns GeminiProvider for google models", () => {
    const provider = createProvider("gemini-2.0-flash", "test-key");
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider.name).toBe("Google Gemini");
  });

  it("returns OpenAICompatibleProvider for openai models", () => {
    const provider = createProvider("gpt-4o", "test-key");
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe("GPT");
  });

  it("returns OpenAICompatibleProvider for deepseek models", () => {
    const provider = createProvider("deepseek-chat", "test-key");
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe("DeepSeek");
  });

  it("returns OpenAICompatibleProvider for mistral models", () => {
    const provider = createProvider("mistral-large-latest", "test-key");
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe("Mistral");
  });

  it("throws for unknown model ID", () => {
    expect(() => createProvider("unknown-model", "test-key")).toThrow(
      'Unknown model "unknown-model"'
    );
  });

  it("creates providers for every model in each provider group", () => {
    // Verify at least one model per provider doesn't throw
    const testCases: [string, string][] = [
      ["claude-opus-4-6", "Anthropic Claude"],
      ["claude-haiku-4-5", "Anthropic Claude"],
      ["gpt-4o-mini", "GPT"],
      ["o3-mini", "GPT"],
      ["gemini-2.5-pro", "Google Gemini"],
      ["deepseek-reasoner", "DeepSeek"],
      ["codestral-latest", "Mistral"],
    ];
    for (const [modelId, expectedName] of testCases) {
      const provider = createProvider(modelId, "key");
      expect(provider.name).toBe(expectedName);
    }
  });
});
