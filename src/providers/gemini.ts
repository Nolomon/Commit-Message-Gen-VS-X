import { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE } from "../prompt";
import { CommitMessageProvider } from "./types";

const MAX_DIFF_CHARS = 100_000;

export class GeminiProvider implements CommitMessageProvider {
  readonly name = "Google Gemini";
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(diff: string): Promise<string> {
    let truncatedDiff = diff;
    if (diff.length > MAX_DIFF_CHARS) {
      truncatedDiff =
        diff.substring(0, MAX_DIFF_CHARS) +
        "\n\n... [diff truncated due to size]";
    }

    const userMessage = USER_PROMPT_TEMPLATE.replace("{diff}", truncatedDiff);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userMessage }] }],
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Gemini API request failed (${response.status}): ${errorBody}`
      );
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new Error("No content in Gemini API response");
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
