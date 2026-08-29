/**
 * Every provider reports failures as a JSON body that the providers surface
 * verbatim in the thrown Error's message. Pulling the human-readable part back
 * out keeps the notification readable, and lets a spend problem be answered
 * with a link to the right billing page instead of a wall of JSON.
 */

interface ApiErrorBody {
  message?: unknown;
  error?: unknown;
}

export interface ApiErrorDetails {
  /** HTTP status, when the error carried one. */
  status?: number;
  /** The provider's own human-readable message, or the raw error text. */
  message: string;
  /** The unparsed error text, kept so matching can see codes outside `message`. */
  raw: string;
}

/**
 * Phrases the five providers use when a request fails for want of credit.
 * Deliberately narrow: a plain rate limit must not match, or a retryable
 * failure would be reported as a billing problem and never retried.
 */
const BILLING_PATTERNS: RegExp[] = [
  /credit balance is too low/i, // Anthropic
  /insufficient[ _]quota/i, // OpenAI
  /billing[ _]hard[ _]limit/i, // OpenAI
  /exceeded your current quota/i, // OpenAI, Gemini
  /(?:check|review) your plan and billing/i, // Gemini
  /billing account/i, // Gemini
  /(?:enable|activate) billing/i, // Gemini
  /insufficient[ _]balance/i, // DeepSeek
  /payment required/i, // DeepSeek, Mistral
  /(?:purchase|buy|add|top ?up) (?:more )?credits?/i,
];

/** Payment Required — unambiguous regardless of the body. */
const BILLING_STATUS = 402;

const STATUS_PATTERNS: RegExp[] = [/^(\d{3})\b/, /\((\d{3})\)/];

/** The first `message` string reachable through nested `error` wrappers. */
function messageFrom(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const { message, error } = body as ApiErrorBody;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }
  return messageFrom(error);
}

/** Parse the JSON body the providers append to their error messages. */
function parseJsonTail(raw: string): unknown {
  const start = raw.indexOf("{");
  if (start === -1) {
    return undefined;
  }
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    return undefined;
  }
}

function statusFrom(error: unknown, raw: string): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") {
    return status;
  }
  for (const pattern of STATUS_PATTERNS) {
    const match = pattern.exec(raw);
    if (match) {
      return Number(match[1]);
    }
  }
  return undefined;
}

export function describeApiError(error: unknown): ApiErrorDetails {
  const raw = error instanceof Error ? error.message : String(error);
  // SDK errors expose the parsed body on `error`; the fetch-based providers
  // only have the text they were given.
  const body = (error as { error?: unknown } | null)?.error ?? parseJsonTail(raw);
  return {
    status: statusFrom(error, raw),
    message: messageFrom(body) ?? raw,
    raw,
  };
}

/** Whether the request failed because the account is out of credit or quota. */
export function isBillingError(details: ApiErrorDetails): boolean {
  if (details.status === BILLING_STATUS) {
    return true;
  }
  return BILLING_PATTERNS.some(
    (pattern) => pattern.test(details.message) || pattern.test(details.raw)
  );
}
