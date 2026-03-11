import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE } from "../prompt";
import { CommitMessageProvider } from "./types";

const MAX_DIFF_CHARS = 100_000;

export class ClaudeProvider implements CommitMessageProvider {
  readonly name = "Anthropic Claude";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in AI response");
    }

    return stripMarkdownFences(textBlock.text.trim());
  }

  dispose(): void {
    // No persistent resources to clean up
  }
}

function stripMarkdownFences(text: string): string {
  // Remove wrapping ```...``` if the model accidentally adds them
  const fenceRegex = /^```[\w]*\n?([\s\S]*?)\n?```$/;
  const match = text.match(fenceRegex);
  return match ? match[1].trim() : text;
}
