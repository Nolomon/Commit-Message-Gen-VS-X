import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAICompatibleProvider } from "../providers/openai-compatible";
import { SYSTEM_PROMPT } from "../core/prompt";
import { MAX_TOKENS, MAX_DIFF_CHARS } from "../providers/shared";

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () =>
      Promise.resolve(
        typeof body === "string" ? body : JSON.stringify(body)
      ),
    json: () => Promise.resolve(body),
  } as Partial<Response> as Response;
}

describe("OpenAICompatibleProvider", () => {
  let provider: OpenAICompatibleProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    provider = new OpenAICompatibleProvider(
      "test-api-key",
      "gpt-4.1",
      "https://api.openai.com/v1",
      "GPT"
    );
  });

  it("name property matches constructor arg", () => {
    expect(provider.name).toBe("GPT");
  });

  it("POSTs to correct URL", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ choices: [{ message: { content: "feat: add x" } }] })
    );

    await provider.generate("diff");

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/chat/completions"
    );
  });

  it("sends correct Authorization header", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ choices: [{ message: { content: "feat: x" } }] })
    );

    await provider.generate("diff");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer test-api-key");
  });

  it("sends Content-Type application/json", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ choices: [{ message: { content: "feat: x" } }] })
    );

    await provider.generate("diff");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sends correct body structure", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ choices: [{ message: { content: "feat: x" } }] })
    );

    await provider.generate("my diff content");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4.1");
    expect(body.max_completion_tokens).toBe(MAX_TOKENS);
    expect(body.max_tokens).toBeUndefined();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain("my diff content");
  });

  it("returns parsed content from response", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ choices: [{ message: { content: "feat(x): add y" } }] })
    );

    const result = await provider.generate("diff");
    expect(result).toBe("feat(x): add y");
  });

  it("strips markdown fences from response content", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        choices: [{ message: { content: "```\nfeat(x): add y\n```" } }],
      })
    );

    const result = await provider.generate("diff");
    expect(result).toBe("feat(x): add y");
  });

  it("trims whitespace from content", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        choices: [{ message: { content: "  feat(x): add y  " } }],
      })
    );

    const result = await provider.generate("diff");
    expect(result).toBe("feat(x): add y");
  });

  it("throws on non-ok response with status and body", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("Unauthorized", 401));

    await expect(provider.generate("diff")).rejects.toThrow(
      "API request failed (401)"
    );
  });

  it("throws when choices array is missing", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));

    await expect(provider.generate("diff")).rejects.toThrow(
      "No content in API response"
    );
  });

  it("throws when choices array is empty", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ choices: [] }));

    await expect(provider.generate("diff")).rejects.toThrow(
      "No content in API response"
    );
  });

  it("throws when message content is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ choices: [{ message: {} }] })
    );

    await expect(provider.generate("diff")).rejects.toThrow(
      "No content in API response"
    );
  });

  it("throws when message content is null", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ choices: [{ message: { content: null } }] })
    );

    await expect(provider.generate("diff")).rejects.toThrow(
      "No content in API response"
    );
  });

  it("throws when response body is not valid JSON", async () => {
    const badResponse = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as Partial<Response> as Response;
    mockFetch.mockResolvedValueOnce(badResponse);

    await expect(provider.generate("diff")).rejects.toThrow(
      "Failed to parse API response as JSON"
    );
  });

  it("propagates fetch errors (network failure)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(provider.generate("diff")).rejects.toThrow("Network error");
  });

  it("truncates large diffs", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ choices: [{ message: { content: "chore: update" } }] })
    );

    const largeDiff = "x".repeat(MAX_DIFF_CHARS + 500);
    await provider.generate(largeDiff);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain(
      "... [diff truncated due to size]"
    );
  });

  it("uses max_tokens when configured", async () => {
    const mistralProvider = new OpenAICompatibleProvider(
      "key",
      "mistral-large-latest",
      "https://api.mistral.ai/v1",
      "Mistral",
      "max_tokens"
    );
    mockFetch.mockResolvedValueOnce(
      mockResponse({ choices: [{ message: { content: "fix: thing" } }] })
    );

    await mistralProvider.generate("diff");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(MAX_TOKENS);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it("works with different base URLs", async () => {
    const deepseekProvider = new OpenAICompatibleProvider(
      "key",
      "deepseek-chat",
      "https://api.deepseek.com",
      "DeepSeek"
    );
    mockFetch.mockResolvedValueOnce(
      mockResponse({ choices: [{ message: { content: "fix: thing" } }] })
    );

    await deepseekProvider.generate("diff");

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api.deepseek.com/chat/completions"
    );
  });

  it("dispose does not throw", () => {
    expect(() => provider.dispose()).not.toThrow();
  });
});
