import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn(function (this: any) {
    this.messages = { create: mockCreate };
  });
  return { default: MockAnthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { ClaudeProvider } from "../providers/claude";
import { SYSTEM_PROMPT } from "../prompt";
import { MAX_TOKENS, MAX_DIFF_CHARS } from "../providers/shared";

describe("ClaudeProvider", () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ClaudeProvider("test-api-key", "claude-sonnet-4-6");
  });

  it('has name "Anthropic Claude"', () => {
    expect(provider.name).toBe("Anthropic Claude");
  });

  it("constructs Anthropic client with apiKey", () => {
    expect(Anthropic).toHaveBeenCalledWith({ apiKey: "test-api-key" });
  });

  it("calls messages.create with correct parameters", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "feat(auth): add login" }],
    });

    await provider.generate("some diff");

    expect(mockCreate).toHaveBeenCalledOnce();
    const args = mockCreate.mock.calls[0][0];
    expect(args.model).toBe("claude-sonnet-4-6");
    expect(args.max_tokens).toBe(MAX_TOKENS);
    expect(args.system).toBe(SYSTEM_PROMPT);
    expect(args.messages).toHaveLength(1);
    expect(args.messages[0].role).toBe("user");
    expect(args.messages[0].content).toContain("some diff");
  });

  it("returns text from response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "feat(auth): add login" }],
    });

    const result = await provider.generate("diff");
    expect(result).toBe("feat(auth): add login");
  });

  it("strips markdown fences from response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "```\nfeat(auth): add login\n```" }],
    });

    const result = await provider.generate("diff");
    expect(result).toBe("feat(auth): add login");
  });

  it("trims whitespace from response text", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "  feat(auth): add login  " }],
    });

    const result = await provider.generate("diff");
    expect(result).toBe("feat(auth): add login");
  });

  it("throws when no text block in response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
    });

    await expect(provider.generate("diff")).rejects.toThrow(
      "No text content in AI response"
    );
  });

  it("throws when content array is empty", async () => {
    mockCreate.mockResolvedValueOnce({ content: [] });

    await expect(provider.generate("diff")).rejects.toThrow(
      "No text content in AI response"
    );
  });

  it("propagates SDK errors", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Rate limited"));

    await expect(provider.generate("diff")).rejects.toThrow("Rate limited");
  });

  it("truncates large diffs", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "chore: update" }],
    });

    const largeDiff = "x".repeat(MAX_DIFF_CHARS + 500);
    await provider.generate(largeDiff);

    const userMessage = mockCreate.mock.calls[0][0].messages[0].content;
    expect(userMessage).toContain("... [diff truncated due to size]");
    expect(userMessage).not.toContain("x".repeat(MAX_DIFF_CHARS + 1));
  });

  it("dispose does not throw", () => {
    expect(() => provider.dispose()).not.toThrow();
  });
});
