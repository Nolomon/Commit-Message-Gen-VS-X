import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  stripMarkdownFences,
  buildUserMessage,
  truncateDiff,
  withRetry,
  MAX_DIFF_CHARS,
  MAX_TOKENS,
} from "../providers/shared";
import { USER_PROMPT_TEMPLATE } from "../core/prompt";

describe("stripMarkdownFences", () => {
  it("returns plain text unchanged", () => {
    expect(stripMarkdownFences("fix(auth): handle null")).toBe(
      "fix(auth): handle null"
    );
  });

  it("strips triple backtick fences with no language tag", () => {
    expect(stripMarkdownFences("```\nfix(auth): handle null\n```")).toBe(
      "fix(auth): handle null"
    );
  });

  it("strips fences with a language tag", () => {
    expect(stripMarkdownFences("```text\nfeat(ui): add button\n```")).toBe(
      "feat(ui): add button"
    );
  });

  it("strips fences with 'markdown' language tag", () => {
    expect(
      stripMarkdownFences("```markdown\nfeat(ui): add button\n```")
    ).toBe("feat(ui): add button");
  });

  it("preserves inner newlines within fences", () => {
    const input = "```\nfeat(ui): add button\n\n- item one\n- item two\n```";
    expect(stripMarkdownFences(input)).toBe(
      "feat(ui): add button\n\n- item one\n- item two"
    );
  });

  it("does not strip partial fences (only opening)", () => {
    const input = "```\nsome text";
    expect(stripMarkdownFences(input)).toBe(input);
  });

  it("does not strip fences that are not at boundaries", () => {
    const input = "hello ```code``` world";
    expect(stripMarkdownFences(input)).toBe(input);
  });

  it("handles empty content inside fences", () => {
    expect(stripMarkdownFences("```\n\n```")).toBe("");
  });

  it("handles empty string input", () => {
    expect(stripMarkdownFences("")).toBe("");
  });

  it("trims whitespace inside fences", () => {
    expect(
      stripMarkdownFences("```\n  fix(auth): handle null  \n```")
    ).toBe("fix(auth): handle null");
  });

  it("does not strip two separate fence blocks", () => {
    const input = "```\nfirst\n```\n\n```\nsecond\n```";
    expect(stripMarkdownFences(input)).toBe(input);
  });

  it("preserves nested backticks inside a fence", () => {
    expect(stripMarkdownFences("```\n`inner`\n```")).toBe("`inner`");
  });
});

describe("truncateDiff", () => {
  it("returns small diffs unchanged", () => {
    const diff = "diff --git a/f.ts b/f.ts\n+line";
    expect(truncateDiff(diff, 1000)).toBe(diff);
  });

  it("preserves complete file sections that fit", () => {
    const section1 =
      "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new";
    const section2 =
      "diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-old\n+new";
    const diff = section1 + "\n" + section2;
    const result = truncateDiff(diff, diff.length);
    expect(result).toContain("a/a.ts");
    expect(result).toContain("a/b.ts");
  });

  it("shows headers for files that do not fit", () => {
    const smallSection =
      "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new";
    const largeBody = "x".repeat(500);
    const largeSection =
      `diff --git a/big.ts b/big.ts\n--- a/big.ts\n+++ b/big.ts\n@@ -1 +1 @@\n${largeBody}`;
    const diff = smallSection + "\n" + largeSection;
    // Budget that fits the small section but not the large one
    const result = truncateDiff(diff, smallSection.length + 200);
    expect(result).toContain("-old\n+new");
    expect(result).toContain("diff --git a/big.ts b/big.ts");
    expect(result).toContain("remaining files shown as headers only");
    expect(result).not.toContain(largeBody);
  });

  it("falls back to substring for non-git diffs", () => {
    const diff = "a".repeat(200);
    const result = truncateDiff(diff, 100);
    expect(result).toContain("... [diff truncated due to size]");
    expect(result.length).toBeLessThan(200);
  });

  it("handles single large file section", () => {
    const body = "x".repeat(1000);
    const diff = `diff --git a/big.ts b/big.ts\n--- a/big.ts\n+++ b/big.ts\n@@ -1 +1 @@\n${body}`;
    const result = truncateDiff(diff, 200);
    expect(result).toContain("diff --git a/big.ts b/big.ts");
    expect(result).toContain("remaining files shown as headers only");
  });

  it("returns joined sections without footer when all sections fit in budget", () => {
    // Add a large preamble before the first "diff --git" marker.
    // splitDiffByFile drops the preamble, so sections sum < diff.length.
    // This lets us set maxChars where diff.length > maxChars but all sections fit.
    const preamble = "x".repeat(200) + "\n";
    const section1 =
      "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n";
    const section2 =
      "diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-x\n+y";
    const diff = preamble + section1 + section2;

    // maxChars must be: < diff.length (triggers truncation)
    // but (maxChars - footer.length) >= section1.length + section2.length (all fit)
    const footerLen = "\n\n... [diff truncated \u2014 remaining files shown as headers only]".length;
    const sectionsLen = section1.length + section2.length;
    const maxChars = sectionsLen + footerLen + 5;
    expect(diff.length).toBeGreaterThan(maxChars);

    const result = truncateDiff(diff, maxChars);
    expect(result).toContain("-old\n+new");
    expect(result).toContain("-x\n+y");
    expect(result).not.toContain("remaining files shown as headers only");
  });

  it("extracts headers from sections without hunk markers", () => {
    // A rename-only diff has no @@ lines
    const section1 =
      "diff --git a/old.ts b/new.ts\nsimilarity index 100%\nrename from old.ts\nrename to new.ts";
    const body = "x".repeat(500);
    const section2 =
      `diff --git a/big.ts b/big.ts\n--- a/big.ts\n+++ b/big.ts\n@@ -1 +1 @@\n${body}`;
    const diff = section1 + "\n" + section2;
    const result = truncateDiff(diff, section1.length + 200);
    expect(result).toContain("rename from old.ts");
    expect(result).toContain("diff --git a/big.ts b/big.ts");
  });

  it("skips unrecognized lines in file header area", () => {
    // "GIT binary patch" is not a recognized directive nor a @@ hunk marker,
    // so extractFileHeader should skip it.
    const binaryData = "x".repeat(500);
    const section =
      `diff --git a/img.png b/img.png\nBinary files /dev/null and b/img.png differ\nGIT binary patch\nliteral 1234\n${binaryData}`;
    const diff = section;
    // Budget too small for the full section, so extractFileHeader is called
    const result = truncateDiff(diff, 200);
    expect(result).toContain("Binary files /dev/null and b/img.png differ");
    expect(result).not.toContain("GIT binary patch");
    expect(result).not.toContain("literal 1234");
  });

  it("handles very tight budget where header does not fit", () => {
    const body = "x".repeat(500);
    const section1 =
      `diff --git a/first.ts b/first.ts\n--- a/first.ts\n+++ b/first.ts\n@@ -1 +1 @@\n${body}`;
    const section2 =
      `diff --git a/second.ts b/second.ts\n--- a/second.ts\n+++ b/second.ts\n@@ -1 +1 @@\n${body}`;
    const diff = section1 + "\n" + section2;
    // Very tight budget — only room for the first line of the first section
    const result = truncateDiff(diff, 120);
    expect(result).toContain("diff --git a/first.ts b/first.ts");
    expect(result).toContain("remaining files shown as headers only");
  });
});

describe("buildUserMessage", () => {
  it("inserts the diff into the user prompt template", () => {
    const diff = "diff --git a/file.ts b/file.ts\n+added line";
    const result = buildUserMessage(diff);
    expect(result).toContain(diff);
    expect(result).toContain("```diff");
  });

  it("does not truncate a diff under MAX_DIFF_CHARS", () => {
    const diff = "a".repeat(MAX_DIFF_CHARS - 1);
    const result = buildUserMessage(diff);
    expect(result).not.toContain("truncated");
    expect(result).toContain(diff);
  });

  it("does not truncate a diff exactly at MAX_DIFF_CHARS", () => {
    const diff = "a".repeat(MAX_DIFF_CHARS);
    const result = buildUserMessage(diff);
    expect(result).not.toContain("truncated");
  });

  it("truncates a diff exceeding MAX_DIFF_CHARS", () => {
    const diff = "a".repeat(MAX_DIFF_CHARS + 100);
    const result = buildUserMessage(diff);
    expect(result).toContain("truncated");
  });

  it("truncated message still uses the prompt template", () => {
    const diff = "a".repeat(MAX_DIFF_CHARS + 100);
    const result = buildUserMessage(diff);
    const templatePrefix = USER_PROMPT_TEMPLATE.split("{diff}")[0];
    expect(result).toContain(templatePrefix);
  });

  it("truncates a diff at exactly MAX_DIFF_CHARS + 1", () => {
    const diff = "a".repeat(MAX_DIFF_CHARS + 1);
    const result = buildUserMessage(diff);
    expect(result).toContain("truncated");
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("commit msg");
    const result = await withRetry(fn, "diff");
    expect(result).toBe("commit msg");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("retries on transient 529 overloaded error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("529 overloaded"))
      .mockResolvedValue("commit msg");

    const promise = withRetry(fn, "diff");
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toBe("commit msg");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on transient 429 rate limit error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 too many requests"))
      .mockResolvedValue("commit msg");

    const promise = withRetry(fn, "diff");
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toBe("commit msg");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on error with status property", async () => {
    const error = Object.assign(new Error("overloaded"), { status: 529 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue("commit msg");

    const promise = withRetry(fn, "diff");
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toBe("commit msg");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on transient 503 service unavailable error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("503 service unavailable"))
      .mockResolvedValue("commit msg");

    const promise = withRetry(fn, "diff");
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toBe("commit msg");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on error with status 503", async () => {
    const error = Object.assign(new Error("unavailable"), { status: 503 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue("commit msg");

    const promise = withRetry(fn, "diff");
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toBe("commit msg");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on error with status 429", async () => {
    const error = Object.assign(new Error("limit"), { status: 429 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue("commit msg");

    const promise = withRetry(fn, "diff");
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toBe("commit msg");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-Error thrown values", async () => {
    const fn = vi.fn().mockRejectedValue("string error");

    await expect(withRetry(fn, "diff")).rejects.toBe("string error");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("retries on non-Error with status property", async () => {
    const error = { status: 529, message: "overloaded" };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue("commit msg");

    const promise = withRetry(fn, "diff");
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toBe("commit msg");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry an out-of-credit error reported as a 429", async () => {
    const error = Object.assign(
      new Error(
        'API request failed (429): {"error":{"message":"You exceeded your current quota.","code":"insufficient_quota"}}'
      ),
      { status: 429 }
    );
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, "diff")).rejects.toThrow("insufficient_quota");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("does not retry non-transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));

    await expect(withRetry(fn, "diff")).rejects.toThrow("Invalid API key");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("throws after exhausting all retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("529 overloaded"));

    const promise = withRetry(fn, "diff").catch((e: Error) => e);
    // Advance past all backoff timers
    await vi.advanceTimersByTimeAsync(30_000);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("529 overloaded");
    expect(fn.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("constants", () => {
  it("MAX_DIFF_CHARS equals 100000", () => {
    expect(MAX_DIFF_CHARS).toBe(100_000);
  });

  it("MAX_TOKENS equals 4096", () => {
    expect(MAX_TOKENS).toBe(4096);
  });
});
