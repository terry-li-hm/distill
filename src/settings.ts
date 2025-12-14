import { DistillSettings } from "./types";

export const DEFAULT_SETTINGS: DistillSettings = {
  openRouterApiKey: "",
  drafterModel: "openai/gpt-4o",
  criticModel: "anthropic/claude-4-sonnet-20250522",
  maxInterpretationRounds: 3,
  maxRefinementRounds: 3,
  inboxPath: "Inbox.md",
};

// Available models for OpenRouter
// See: https://openrouter.ai/models, https://openrouter.ai/anthropic, https://openrouter.ai/openai
export const DRAFTER_MODELS = [
  { id: "openai/gpt-4o", name: "GPT-4o (Recommended)" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (Faster)" },
  { id: "openai/gpt-4.1-2025-04-14", name: "GPT-4.1" },
  { id: "anthropic/claude-4-sonnet-20250522", name: "Claude 4 Sonnet" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
];

export const CRITIC_MODELS = [
  { id: "anthropic/claude-4-sonnet-20250522", name: "Claude 4 Sonnet (Recommended)" },
  { id: "anthropic/claude-4-opus-20250522", name: "Claude 4 Opus" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
  { id: "openai/gpt-4o", name: "GPT-4o" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (Faster)" },
];
