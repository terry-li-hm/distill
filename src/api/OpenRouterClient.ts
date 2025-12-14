import { requestUrl, RequestUrlResponse } from "obsidian";
import { ChatMessage, ModelRole, CancellationToken } from "../types";
import { API } from "../constants";

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
  error?: {
    message: string;
    code: number;
  };
}

/**
 * Error class for API-specific errors with status code information
 */
export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export class OpenRouterClient {
  private config: OpenRouterConfig;
  private callCount: number = 0;

  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  /**
   * Send a chat completion request to OpenRouter with retry logic
   */
  async chat(
    role: ModelRole,
    messages: ChatMessage[],
    cancellation?: CancellationToken
  ): Promise<string> {
    const model = role === "drafter" ? this.config.drafterModel : this.config.criticModel;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < API.MAX_RETRIES; attempt++) {
      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

      try {
        const result = await this.makeRequest(model, messages);
        this.callCount++;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");

        // Check if error is retryable
        if (error instanceof OpenRouterError && error.isRetryable) {
          // Calculate delay with exponential backoff and jitter
          const delay = Math.min(
            API.RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000,
            API.RETRY_MAX_DELAY_MS
          );

          // Wait before retry
          await this.sleep(delay);
          continue;
        }

        // Non-retryable error, throw immediately
        throw error;
      }
    }

    // All retries exhausted
    throw lastError || new Error("Request failed after maximum retries");
  }

  /**
   * Make a single API request
   */
  private async makeRequest(model: string, messages: ChatMessage[]): Promise<string> {
    let response: RequestUrlResponse;

    try {
      response = await requestUrl({
        url: API.OPENROUTER_URL,
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
          temperature: API.TEMPERATURE,
          max_tokens: API.MAX_TOKENS,
        }),
      });
    } catch (error) {
      // Network error or request failed to send
      throw new OpenRouterError(
        "Network error: Failed to connect to OpenRouter",
        0,
        true // Network errors are retryable
      );
    }

    // Handle HTTP errors based on status code
    if (response.status !== 200) {
      this.handleHttpError(response);
    }

    // Parse response
    const data = response.json as OpenRouterResponse;

    // Check for API-level errors in response body
    if (data.error) {
      throw new OpenRouterError(
        data.error.message || "API error",
        data.error.code || response.status,
        false
      );
    }

    // Validate response structure
    if (!data.choices || data.choices.length === 0) {
      throw new OpenRouterError("No response from model", response.status, false);
    }

    const content = data.choices[0].message.content;
    if (!content) {
      throw new OpenRouterError("Empty response from model", response.status, false);
    }

    return content;
  }

  /**
   * Handle HTTP error responses with proper status code detection
   */
  private handleHttpError(response: RequestUrlResponse): never {
    const status = response.status;
    const isRetryable = (API.RETRYABLE_STATUS_CODES as readonly number[]).includes(status);

    // Map status codes to user-friendly messages
    const errorMessages: Record<number, string> = {
      400: "Bad request. The model ID may be invalid.",
      401: "Invalid API key. Please check your OpenRouter API key in settings.",
      402: "Insufficient credits. Please add credits to your OpenRouter account.",
      403: "Access forbidden. Your API key may not have access to this model.",
      404: "Model not found. Please select a different model in settings.",
      429: "Rate limited. Retrying...",
      500: "OpenRouter server error. Please try again.",
      502: "Bad gateway. OpenRouter may be experiencing issues.",
      503: "Service temporarily unavailable. Retrying...",
      504: "Gateway timeout. Retrying...",
    };

    const message = errorMessages[status] || `Request failed with status ${status}`;

    throw new OpenRouterError(message, status, isRetryable);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
