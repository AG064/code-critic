import type { GenerationParameters } from "../input/types.js";

export class ReviewError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface JsonCompletionRequest {
  system: string;
  user: string;
  generation: GenerationParameters;
  timeoutMs?: number;
}

export interface JsonCompletionClient {
  completeJson(request: JsonCompletionRequest): Promise<string>;
}

function readConfig(): DeepSeekConfig {
  const timeoutMs = Number.parseInt(process.env.DEEPSEEK_TIMEOUT_MS ?? "55000", 10);

  return {
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? "",
    baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
    timeoutMs
  };
}

function validateConfig(config: DeepSeekConfig): void {
  if (!config.apiKey) {
    throw new ReviewError("provider_not_configured", 503, "DeepSeek is not configured.");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(config.baseUrl);
  } catch {
    throw new ReviewError("provider_not_configured", 503, "DeepSeek is not configured correctly.");
  }

  if (!(["http:", "https:"] as const).includes(baseUrl.protocol as "http:" | "https:")) {
    throw new ReviewError("provider_not_configured", 503, "DeepSeek is not configured correctly.");
  }

  if (!config.model || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 60000) {
    throw new ReviewError("provider_not_configured", 503, "DeepSeek is not configured correctly.");
  }
}

function providerError(status: number): ReviewError {
  if (status === 401 || status === 403) {
    return new ReviewError("provider_authentication_failed", 503, "DeepSeek authentication failed.");
  }
  if (status === 429) {
    return new ReviewError("provider_rate_limited", 429, "DeepSeek rate limit reached. Try again shortly.");
  }
  if (status >= 500) {
    return new ReviewError("provider_unavailable", 503, "DeepSeek is unavailable. Try again shortly.");
  }
  return new ReviewError("provider_request_failed", 502, "DeepSeek could not complete the review.");
}

function readContent(value: unknown): string {
  if (typeof value !== "object" || value === null || !("choices" in value) || !Array.isArray(value.choices)) {
    throw new ReviewError("provider_invalid_response", 502, "DeepSeek returned an invalid response.");
  }

  const choice = value.choices[0];
  if (typeof choice !== "object" || choice === null || !("message" in choice)) {
    throw new ReviewError("provider_invalid_response", 502, "DeepSeek returned an invalid response.");
  }

  if ("finish_reason" in choice && choice.finish_reason === "length") {
    throw new ReviewError("provider_output_incomplete", 502, "DeepSeek returned an incomplete report. Try again.");
  }

  const message = choice.message;
  if (typeof message !== "object" || message === null || !("content" in message) || typeof message.content !== "string") {
    throw new ReviewError("provider_invalid_response", 502, "DeepSeek returned an invalid response.");
  }

  const content = message.content.trim();
  if (!content) {
    throw new ReviewError("provider_invalid_response", 502, "DeepSeek returned an empty report. Try again.");
  }

  return content;
}

export class DeepSeekClient implements JsonCompletionClient {
  constructor(
    private readonly config = readConfig(),
    private readonly fetcher: typeof fetch = fetch
  ) {
    validateConfig(config);
  }

  async completeJson(request: JsonCompletionRequest): Promise<string> {
    const controller = new AbortController();
    const requestedTimeout = request.timeoutMs ?? this.config.timeoutMs;
    const timeoutMs = Number.isInteger(requestedTimeout) && requestedTimeout > 0
      ? Math.min(requestedTimeout, this.config.timeoutMs)
      : this.config.timeoutMs;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetcher(`${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user }
          ],
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
          temperature: request.generation.temperature,
          max_tokens: request.generation.max_tokens,
          top_p: request.generation.top_p,
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw providerError(response.status);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ReviewError("provider_invalid_response", 502, "DeepSeek returned an invalid response.");
      }

      return readContent(body);
    } catch (error) {
      if (error instanceof ReviewError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new ReviewError("provider_timeout", 504, "The review timed out. Try again.");
      }
      throw new ReviewError("provider_unavailable", 503, "DeepSeek is unavailable. Try again shortly.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
