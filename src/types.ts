/**
 * Core type definitions for Distill plugin
 */

// =============================================================================
// Settings
// =============================================================================

export interface DistillSettings {
  openRouterApiKey: string;
  drafterModel: string;
  criticModel: string;
  maxInterpretationRounds: number;
  maxRefinementRounds: number;
  inboxPath: string;
}

// =============================================================================
// Article Extraction
// =============================================================================

export interface ExtractedArticle {
  title: string;
  content: string;
  url: string;
  siteName?: string;
  excerpt?: string;
}

// =============================================================================
// Atomic Notes
// =============================================================================

export interface AtomicNote {
  heading: string;
  content: string;
  hasLink: boolean;
  raw: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// API
// =============================================================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ModelRole = "drafter" | "critic";

// =============================================================================
// Dialogue State
// =============================================================================

export type DialoguePhase =
  | "interpreting"
  | "aligned"
  | "drafting"
  | "refining"
  | "complete"
  | "error";

export interface DialogueState {
  phase: DialoguePhase;
  interpretationRounds: number;
  refinementRounds: number;
  claudeInterpretation?: string;
  gptInterpretation?: string;
  alignedInterpretation?: string;
  currentDraft?: AtomicNote[];
  currentCritique?: string;
  error?: string;
}

export interface DialogueResult {
  article: ExtractedArticle;
  state: DialogueState;
  atomicNotes: AtomicNote[];
  totalApiCalls: number;
}

// =============================================================================
// Progress Tracking
// =============================================================================

export interface ProgressUpdate {
  phase: DialoguePhase;
  currentRound?: number;
  maxRounds?: number;
  message: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

// =============================================================================
// Cancellation
// =============================================================================

export interface CancellationToken {
  cancelled: boolean;
  cancel: () => void;
}

export function createCancellationToken(): CancellationToken {
  const token: CancellationToken = {
    cancelled: false,
    cancel: () => {
      token.cancelled = true;
    },
  };
  return token;
}
