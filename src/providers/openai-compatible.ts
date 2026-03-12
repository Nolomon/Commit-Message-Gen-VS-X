import { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE } from "../prompt";
import { CommitMessageProvider } from "./types";

const MAX_DIFF_CHARS = 100_000;

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
    let truncatedDiff = diff;
    if (diff.length > MAX_DIFF_CHARS) {
      truncatedDiff =
        diff.substring(0, MAX_DIFF_CHARS) +
        "\n\n... [diff truncated due to size]";
    }

    const userMessage = USER_PROMPT_TEMPLATE.replace("{diff}", truncatedDiff);

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
        max_tokens: 1024,
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

function stripMarkdownFences(text: string): string {
  const fenceRegex = /^```[\w]*\n?([\s\S]*?)\n?```$/;
  const match = text.match(fenceRegex);
  return match ? match[1].trim() : text;
}
