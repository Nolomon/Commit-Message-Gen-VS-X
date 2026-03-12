import { USER_PROMPT_TEMPLATE } from "../prompt";

export const MAX_DIFF_CHARS = 100_000;

export const MAX_TOKENS = 1024;

export function stripMarkdownFences(text: string): string {
  const fenceRegex = /^```[\w]*\n?([\s\S]*?)\n?```$/;
  const match = text.match(fenceRegex);
  return match ? match[1].trim() : text;
}

export function buildUserMessage(diff: string): string {
  let truncatedDiff = diff;
  if (diff.length > MAX_DIFF_CHARS) {
    truncatedDiff =
      diff.substring(0, MAX_DIFF_CHARS) +
      "\n\n... [diff truncated due to size]";
  }
  return USER_PROMPT_TEMPLATE.replace("{diff}", truncatedDiff);
}
