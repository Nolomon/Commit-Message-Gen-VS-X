import { describe, it, expect } from "vitest";
import {
  stripMarkdownFences,
  buildUserMessage,
  MAX_DIFF_CHARS,
  MAX_TOKENS,
} from "../providers/shared";
import { USER_PROMPT_TEMPLATE } from "../prompt";

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
    expect(result).not.toContain("[diff truncated due to size]");
    expect(result).toContain(diff);
  });

  it("does not truncate a diff exactly at MAX_DIFF_CHARS", () => {
    const diff = "a".repeat(MAX_DIFF_CHARS);
    const result = buildUserMessage(diff);
    expect(result).not.toContain("[diff truncated due to size]");
  });

  it("truncates a diff exceeding MAX_DIFF_CHARS", () => {
    const diff = "a".repeat(MAX_DIFF_CHARS + 100);
    const result = buildUserMessage(diff);
    expect(result).toContain("... [diff truncated due to size]");
  });

  it("truncated message still uses the prompt template", () => {
    const diff = "a".repeat(MAX_DIFF_CHARS + 100);
    const result = buildUserMessage(diff);
    const templatePrefix = USER_PROMPT_TEMPLATE.split("{diff}")[0];
    expect(result).toContain(templatePrefix);
  });
});

describe("constants", () => {
  it("MAX_DIFF_CHARS equals 100000", () => {
    expect(MAX_DIFF_CHARS).toBe(100_000);
  });

  it("MAX_TOKENS equals 1024", () => {
    expect(MAX_TOKENS).toBe(1024);
  });
});
