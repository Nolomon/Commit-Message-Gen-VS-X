import { USER_PROMPT_TEMPLATE } from "../core/prompt";
import { describeApiError, isBillingError } from "../core/api-error";

export const MAX_DIFF_CHARS = 100_000;

export const MAX_TOKENS = 4096;

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;

export function stripMarkdownFences(text: string): string {
  const fenceRegex = /^```[\w]*\n((?:(?!```)[\s\S])*)\n```$/;
  const match = text.match(fenceRegex);
  return match ? match[1].trim() : text;
}

/**
 * Split a unified diff into per-file sections.
 * Each section starts with "diff --git".
 */
function splitDiffByFile(diff: string): string[] {
  const sections: string[] = [];
  const marker = "diff --git";
  let start = diff.indexOf(marker);
  while (start !== -1) {
    const next = diff.indexOf(marker, start + 1);
    sections.push(next === -1 ? diff.substring(start) : diff.substring(start, next));
    start = next;
  }
  return sections;
}

/**
 * Extract just the header lines (diff --git, index, ---, +++) from a file section.
 */
function extractFileHeader(section: string): string {
  const lines = section.split("\n");
  const headerLines: string[] = [];
  for (const line of lines) {
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to") ||
      line.startsWith("similarity index") ||
      line.startsWith("Binary files")
    ) {
      headerLines.push(line);
    } else if (line.startsWith("@@")) {
      break;
    }
  }
  return headerLines.join("\n");
}

/**
 * Truncate a diff to fit within a character budget.
 * Preserves complete file sections where possible and summarizes the rest.
 */
export function truncateDiff(diff: string, maxChars: number): string {
  if (diff.length <= maxChars) {
    return diff;
  }

  const sections = splitDiffByFile(diff);
  if (sections.length === 0) {
    return diff.substring(0, maxChars) + "\n\n... [diff truncated due to size]";
  }

  const included: string[] = [];
  const skippedHeaders: string[] = [];
  let budget = maxChars;
  const footer = "\n\n... [diff truncated — remaining files shown as headers only]";
  budget -= footer.length;

  for (const section of sections) {
    if (section.length <= budget) {
      included.push(section);
      budget -= section.length;
    } else {
      const header = extractFileHeader(section);
      if (header.length + 1 <= budget) {
        skippedHeaders.push(header);
        budget -= header.length + 1;
      } else {
        skippedHeaders.push(section.split("\n")[0]);
        break;
      }
    }
  }

  if (skippedHeaders.length === 0) {
    return included.join("");
  }

  return (
    included.join("") +
    "\n" +
    skippedHeaders.join("\n") +
    footer
  );
}

export function buildUserMessage(diff: string): string {
  const truncatedDiff = truncateDiff(diff, MAX_DIFF_CHARS);
  return USER_PROMPT_TEMPLATE.replace("{diff}", truncatedDiff);
}

function isTransientError(error: unknown): boolean {
  // An exhausted balance can look transient — OpenAI reports it as a 429 — but
  // no amount of backoff clears it. Failing fast gets the user the billing link
  // instead of fifteen seconds of progress bar first.
  if (isBillingError(describeApiError(error))) {
    return false;
  }
  if (error instanceof Error) {
    const msg = error.message;
    if (/\b(529|overloaded)\b/i.test(msg)) {
      return true;
    }
    if (/\b(429|rate.?limit|too many requests)\b/i.test(msg)) {
      return true;
    }
    if (/\b(503|service.?unavailable)\b/i.test(msg)) {
      return true;
    }
  }
  // Handle fetch-style responses embedded in error objects
  const err = error as { status?: number };
  if (err.status === 429 || err.status === 529 || err.status === 503) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a provider call with exponential backoff for transient errors.
 * On the last retry, reduces the diff size to help with overloaded APIs.
 */
export async function withRetry(
  fn: (diff: string) => Promise<string>,
  diff: string
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const effectiveDiff =
        attempt >= MAX_RETRIES
          ? truncateDiff(diff, Math.floor(MAX_DIFF_CHARS / 2))
          : diff;
      return await fn(effectiveDiff);
    } catch (error) {
      if (!isTransientError(error) || attempt >= MAX_RETRIES) {
        throw error;
      }
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      const jitter = Math.random() * backoff * 0.5;
      await sleep(backoff + jitter);
    }
  }
}
