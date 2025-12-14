import { requestUrl } from "obsidian";
import { ChatMessage, ModelRole } from "../types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface OpenRouterConfig {
  apiKey: string;
  drafterModel: string;
  criticModel: string;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterClient {
  private config: OpenRouterConfig;
  private callCount: number = 0;

  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  /**
   * Send a chat completion request to OpenRouter
   */
  async chat(role: ModelRole, messages: ChatMessage[]): Promise<string> {
    const model = role === "drafter" ? this.config.drafterModel : this.config.criticModel;

    try {
      const response = await requestUrl({
        url: OPENROUTER_API_URL,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://obsidian.md",
          "X-Title": "Obsidian Distill Plugin",
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });

      if (response.status !== 200) {
        const errorText = response.text || "Unknown error";
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
      }

      const data = response.json as OpenRouterResponse;
      this.callCount++;

      if (!data.choices || data.choices.length === 0) {
        throw new Error("No response from model");
      }

      const content = data.choices[0].message.content;
      if (!content) {
        throw new Error("Empty response from model");
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        // Check for common error patterns
        if (error.message.includes("401")) {
          throw new Error("Invalid API key. Please check your OpenRouter API key in settings.");
        }
        if (error.message.includes("402")) {
          throw new Error("Insufficient credits. Please add credits to your OpenRouter account.");
        }
        if (error.message.includes("429")) {
          throw new Error("Rate limited. Please wait a moment and try again.");
        }
        if (error.message.includes("503")) {
          throw new Error("Model temporarily unavailable. Please try again or select a different model.");
        }
        throw error;
      }
      throw new Error("Unknown API error");
    }
  }

  /**
   * Get the total number of API calls made
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Reset the call counter
   */
  resetCallCount(): void {
    this.callCount = 0;
  }
}
