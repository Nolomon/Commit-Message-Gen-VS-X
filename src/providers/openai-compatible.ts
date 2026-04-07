import { SYSTEM_PROMPT } from "../core/prompt";
import { CommitMessageProvider } from "./types";
import { stripMarkdownFences, buildUserMessage, withRetry, MAX_TOKENS } from "./shared";
import { registerProvider } from "./registry";
import { PROVIDERS } from "./models";

export class OpenAICompatibleProvider implements CommitMessageProvider {
  readonly name: string;
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(
    apiKey: string,
    model: string,
    baseUrl: string,
    name: string
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
    this.name = name;
  }

  async generate(diff: string): Promise<string> {
    return withRetry(async (effectiveDiff) => {
      const userMessage = buildUserMessage(effectiveDiff);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          max_completion_tokens: MAX_TOKENS,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed (${response.status}): ${errorBody}`);
      }

      let data: { choices?: { message?: { content?: string } }[] };
      try {
        data = (await response.json()) as typeof data;
      } catch {
        throw new Error("Failed to parse API response as JSON");
      }
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("No content in API response");
      }

      return stripMarkdownFences(content.trim());
    }, diff);
  }

  dispose(): void {
    // No persistent resources to clean up
  }
}

for (const providerId of ["openai", "deepseek", "mistral"] as const) {
  const info = PROVIDERS[providerId];
  registerProvider(providerId, (apiKey, modelId) =>
    new OpenAICompatibleProvider(apiKey, modelId, info.baseUrl!, info.displayName)
  );
}
