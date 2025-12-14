/**
 * Configuration constants for Distill plugin
 * Centralizes magic numbers and configuration values
 */

// =============================================================================
// API Configuration
// =============================================================================

export const API = {
  /** OpenRouter API endpoint */
  OPENROUTER_URL: "https://openrouter.ai/api/v1/chat/completions",

  /** Maximum tokens for model responses */
  MAX_TOKENS: 4096,

  /** Temperature for model responses (0-1) */
  TEMPERATURE: 0.7,

  /** Maximum retry attempts for transient failures */
  MAX_RETRIES: 3,

  /** Base delay for exponential backoff (ms) */
  RETRY_BASE_DELAY_MS: 1000,

  /** Maximum delay between retries (ms) */
  RETRY_MAX_DELAY_MS: 10000,

  /** HTTP status codes that should trigger a retry */
  RETRYABLE_STATUS_CODES: [429, 503, 502, 504] as const,
} as const;

// =============================================================================
// Content Processing
// =============================================================================

export const CONTENT = {
  /** Maximum characters for article content sent to models (~6000 words) */
  MAX_ARTICLE_CHARS: 24000,

  /** Minimum heading length for validation */
  MIN_HEADING_LENGTH: 10,

  /** Maximum heading length for validation */
  MAX_HEADING_LENGTH: 100,

  /** Minimum content length for validation */
  MIN_CONTENT_LENGTH: 50,

  /** Maximum content length for atomic notes (should be concise) */
  MAX_CONTENT_LENGTH: 1000,

  /** Maximum paragraphs in an atomic note */
  MAX_PARAGRAPHS: 2,

  /** Preview text truncation length in approval modal */
  PREVIEW_TRUNCATE_LENGTH: 200,
} as const;

// =============================================================================
// Dialogue Detection
// =============================================================================

export const DIALOGUE = {
  /** Keywords that indicate interpretation alignment */
  ALIGNMENT_KEYWORDS: ["ALIGNED", "I AGREE WITH THIS INTERPRETATION", "WE ARE ALIGNED"] as const,

  /** Keywords that indicate draft approval */
  APPROVAL_KEYWORDS: ["APPROVED"] as const,

  /** Keywords that indicate marginal improvements only */
  MARGINAL_KEYWORDS: ["MARGINAL"] as const,
} as const;

// =============================================================================
// URL Validation
// =============================================================================

export const URL_VALIDATION = {
  /** Allowed URL protocols */
  ALLOWED_PROTOCOLS: ["http:", "https:"] as const,

  /** Minimum URL length (protocol + domain) */
  MIN_URL_LENGTH: 10,

  /** Pattern for basic domain validation */
  DOMAIN_PATTERN: /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/,
} as const;
