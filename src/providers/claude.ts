import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "../prompt";
import { CommitMessageProvider } from "./types";
import { stripMarkdownFences, buildUserMessage, MAX_TOKENS } from "./shared";

export class ClaudeProvider implements CommitMessageProvider {
  readonly name = "Anthropic Claude";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(diff: string): Promise<string> {
    const userMessage = buildUserMessage(diff);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
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
