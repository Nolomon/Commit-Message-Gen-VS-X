export class NoDiffError extends Error {
  readonly code = "NO_DIFF" as const;
}

export class UnknownModelError extends Error {
  readonly code = "UNKNOWN_MODEL" as const;
}

export class NoApiKeyError extends Error {
  readonly code = "NO_API_KEY" as const;
}
