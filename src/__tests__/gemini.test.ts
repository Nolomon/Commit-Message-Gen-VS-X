import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeminiProvider } from "../providers/gemini";
import { SYSTEM_PROMPT } from "../prompt";
import { MAX_DIFF_CHARS } from "../providers/shared";

function mockResponse(body: any, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () =>
      Promise.resolve(
        typeof body === "string" ? body : JSON.stringify(body)
      ),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("GeminiProvider", () => {
  let provider: GeminiProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    provider = new GeminiProvider("test-api-key", "gemini-2.0-flash");
  });

  it('has name "Google Gemini"', () => {
    expect(provider.name).toBe("Google Gemini");
  });

  it("POSTs to correct Gemini URL with API key as query param", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        candidates: [{ content: { parts: [{ text: "feat: add x" }] } }],
      })
    );

    await provider.generate("diff");

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test-api-key"
    );
  });

  it("does NOT send Authorization header", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        candidates: [{ content: { parts: [{ text: "feat: x" }] } }],
      })
    );

    await provider.generate("diff");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sends correct body with systemInstruction", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        candidates: [{ content: { parts: [{ text: "feat: x" }] } }],
      })
    );

    await provider.generate("diff");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toBe(SYSTEM_PROMPT);
  });

  it("sends correct body with contents containing the diff", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        candidates: [{ content: { parts: [{ text: "feat: x" }] } }],
      })
    );

    await provider.generate("my diff content");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain("my diff content");
  });

  it("returns parsed content from Gemini response", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        candidates: [
          { content: { parts: [{ text: "feat(x): add y" }] } },
        ],
      })
    );

    const result = await provider.generate("diff");
    expect(result).toBe("feat(x): add y");
  });

  it("strips markdown fences from response", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        candidates: [
          { content: { parts: [{ text: "```\nfeat(x): add y\n```" }] } },
        ],
      })
    );

    const result = await provider.generate("diff");
    expect(result).toBe("feat(x): add y");
  });

  it("trims whitespace from content", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        candidates: [
          { content: { parts: [{ text: "  feat(x): add y  " }] } },
        ],
      })
    );

    const result = await provider.generate("diff");
    expect(result).toBe("feat(x): add y");
  });

  it("throws on non-ok response with status and body", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("Bad Request", 400));

    await expect(provider.generate("diff")).rejects.toThrow(
      "Gemini API request failed (400)"
    );
  });

  it("throws when candidates array is missing", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));

    await expect(provider.generate("diff")).rejects.toThrow(
      "No content in Gemini API response"
    );
  });

  it("throws when candidates array is empty", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ candidates: [] }));

    await expect(provider.generate("diff")).rejects.toThrow(
      "No content in Gemini API response"
    );
  });

  it("throws when content parts are missing", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ candidates: [{ content: {} }] })
    );

    await expect(provider.generate("diff")).rejects.toThrow(
      "No content in Gemini API response"
    );
  });

  it("throws when text is missing from parts", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ candidates: [{ content: { parts: [{}] } }] })
    );

    await expect(provider.generate("diff")).rejects.toThrow(
      "No content in Gemini API response"
    );
  });

  it("propagates fetch errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(provider.generate("diff")).rejects.toThrow("Network error");
  });

  it("truncates large diffs", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        candidates: [{ content: { parts: [{ text: "chore: update" }] } }],
      })
    );

    const largeDiff = "x".repeat(MAX_DIFF_CHARS + 500);
    await provider.generate(largeDiff);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain(
      "... [diff truncated due to size]"
    );
  });

  it("dispose does not throw", () => {
    expect(() => provider.dispose()).not.toThrow();
  });
});
