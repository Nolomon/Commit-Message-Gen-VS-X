import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "../core/prompt";
import { CommitMessageProvider } from "./types";
import { stripMarkdownFences, buildUserMessage, withRetry, MAX_TOKENS } from "./shared";
import { registerProvider } from "./registry";
import { MODELS, ModelRequestOptions } from "./models";

export class ClaudeProvider implements CommitMessageProvider {
  readonly name = "Anthropic Claude";
  private client: Anthropic;
  private model: string;
  private requestOptions: ModelRequestOptions;

  constructor(apiKey: string, model: string, requestOptions: ModelRequestOptions = {}) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.requestOptions = requestOptions;
  }

  async generate(diff: string): Promise<string> {
    return withRetry(async (effectiveDiff) => {
      const userMessage = buildUserMessage(effectiveDiff);

      const response = await this.client.messages.create({
        ...this.requestOptions,
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
    }, diff);
  }

  dispose(): void {
    // No persistent resources to clean up
  }
}

registerProvider(
  "anthropic",
  (apiKey, modelId) =>
    new ClaudeProvider(apiKey, modelId, MODELS[modelId]?.requestOptions)
);
