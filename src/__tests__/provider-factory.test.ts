import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn(function (this: { messages: { create: ReturnType<typeof vi.fn> } }) {
    this.messages = { create: vi.fn() };
  });
  return { default: MockAnthropic };
});

vi.mock("../providers/factory", () => ({
  createProvider: vi.fn(),
}));

import { ProviderFactory } from "../infrastructure/provider-factory";
import { createProvider } from "../providers/factory";

const mockCreateProvider = vi.mocked(createProvider);

describe("ProviderFactory", () => {
  let factory: ProviderFactory;

  beforeEach(() => {
    vi.clearAllMocks();
    factory = new ProviderFactory();
  });

  it("delegates to createProvider with the given modelId and apiKey", () => {
    const mockProvider = { name: "test", generate: vi.fn(), dispose: vi.fn() };
    mockCreateProvider.mockReturnValue(mockProvider);

    const result = factory.create("claude-sonnet-5", "sk-test-key");

    expect(mockCreateProvider).toHaveBeenCalledWith("claude-sonnet-5", "sk-test-key");
    expect(result).toBe(mockProvider);
  });

  it("propagates errors thrown by createProvider", () => {
    mockCreateProvider.mockImplementation(() => {
      throw new Error('Unknown model "bad-model"');
    });

    expect(() => factory.create("bad-model", "key")).toThrow(
      'Unknown model "bad-model"'
    );
  });
});
