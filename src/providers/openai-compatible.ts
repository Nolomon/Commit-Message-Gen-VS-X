import { SYSTEM_PROMPT } from "../prompt";
import { CommitMessageProvider } from "./types";
import { stripMarkdownFences, buildUserMessage, MAX_TOKENS } from "./shared";

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
    const userMessage = buildUserMessage(diff);

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
        max_tokens: MAX_TOKENS,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API request failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in API response");
    }

    return stripMarkdownFences(content.trim());
  }

  dispose(): void {
    // No persistent resources to clean up
  }
}
