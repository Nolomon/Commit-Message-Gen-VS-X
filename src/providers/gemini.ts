import { SYSTEM_PROMPT } from "../core/prompt";
import { CommitMessageProvider } from "./types";
import { stripMarkdownFences, buildUserMessage, withRetry } from "./shared";
import { registerProvider } from "./registry";
import { MODELS, ModelRequestOptions } from "./models";

export class GeminiProvider implements CommitMessageProvider {
  readonly name = "Google Gemini";
  private apiKey: string;
  private model: string;
  private requestOptions: ModelRequestOptions;

  constructor(apiKey: string, model: string, requestOptions: ModelRequestOptions = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.requestOptions = requestOptions;
  }

  async generate(diff: string): Promise<string> {
    return withRetry(async (effectiveDiff) => {
      const userMessage = buildUserMessage(effectiveDiff);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...this.requestOptions,
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

      let data: {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      try {
        data = (await response.json()) as typeof data;
      } catch {
        throw new Error("Failed to parse Gemini API response as JSON");
      }
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new Error("No content in Gemini API response");
      }

      return stripMarkdownFences(content.trim());
    }, diff);
  }

  dispose(): void {
    // No persistent resources to clean up
  }
}

registerProvider(
  "google",
  (apiKey, modelId) =>
    new GeminiProvider(apiKey, modelId, MODELS[modelId]?.requestOptions)
);
