import { OpenRouterClient } from "../api/OpenRouterClient";
import { AtomicNoteParser } from "../parsing/AtomicNoteParser";
import {
  ExtractedArticle,
  AtomicNote,
  ProgressCallback,
  CancellationToken,
  TranscriptEntry,
} from "../types";
import { DIALOGUE } from "../constants";

export interface RefinementResult {
  notes: AtomicNote[];
  rounds: number;
  approved: boolean;
  transcript: TranscriptEntry[];
}

const DRAFT_PROMPT = `Based on this interpretation of the article "{title}":

{interpretation}

Create atomic notes for the most valuable concepts from this article.

Format EACH note as:
### [Concept as descriptive H3 heading]

[Single paragraph, 2-4 sentences, embedding a markdown link to the source naturally within the narrative. The link should use the article title as anchor text like this: [Article Title]({url})]

Guidelines:
- Create 2-5 notes for the most important, actionable concepts
- Each note should be self-contained and capture a single insight
- The heading should describe the insight, not just the topic
- Embed the link naturally within the paragraph, not at the end
- Focus on insights and implications, not just summaries

Begin your notes now:`;

const REVISION_PROMPT = `Revise these atomic notes based on the following feedback:

{critique}

Original notes:
{notes}

Please provide the revised notes in the same format (### heading followed by paragraph with embedded link). Address all the feedback points.`;

const CRITIQUE_PROMPT = `Review these atomic notes drafted from the article "{title}":

{notes}

Evaluate each note for:
1. **Clarity and self-containedness**: Can the note stand alone? Is the insight clear?
2. **Insight value**: Does it capture something valuable, not just summarize?
3. **Natural link integration**: Is the article link woven into the narrative naturally?
4. **Appropriate scope**: Is it truly atomic (single insight) or compound?
5. **Heading quality**: Does the heading describe the insight, not just the topic?

If ALL notes meet these criteria and are ready for use, respond with ONLY the word "APPROVED" on the first line.

If only minor polish is possible but not necessary, respond with ONLY the word "MARGINAL" on the first line, then briefly note what could be slightly better.

If improvements are needed, provide specific, actionable feedback for each note that needs revision. Be direct about what's wrong and how to fix it. Do NOT start with "APPROVED" or "MARGINAL" if changes are needed.`;

/**
 * RefinementLoop manages the draft-critique-revise cycle for atomic notes.
 *
 * Flow:
 * 1. Drafter (GPT) creates initial atomic notes based on aligned interpretation
 * 2. Critic (Claude) reviews notes against quality criteria
 * 3. If approved/marginal, we're done
 * 4. If needs work, drafter revises based on critique
 * 5. Repeat until approved or max rounds reached
 */
export class RefinementLoop {
  private client: OpenRouterClient;
  private parser: AtomicNoteParser;
  private maxRounds: number;

  constructor(client: OpenRouterClient, maxRounds: number) {
    this.client = client;
    this.parser = new AtomicNoteParser();
    this.maxRounds = maxRounds;
  }

  /**
   * Run the draft-critique-revise loop
   *
   * @param article - The source article for context
   * @param interpretation - The aligned interpretation to base notes on
   * @param onProgress - Optional callback for progress updates
   * @param cancellation - Optional token to cancel the operation
   * @returns RefinementResult with final notes and approval status
   */
  async run(
    article: ExtractedArticle,
    interpretation: string,
    onProgress?: ProgressCallback,
    cancellation?: CancellationToken
  ): Promise<RefinementResult> {
    // Step 1: Initial draft from drafter
    onProgress?.({
      phase: "drafting",
      message: "Drafting atomic notes...",
    });

    if (cancellation?.cancelled) {
      throw new Error("Cancelled");
    }

    const draftPrompt = DRAFT_PROMPT
      .replace("{title}", article.title)
      .replace("{interpretation}", interpretation)
      .replace("{url}", article.url);

    let currentDraft = await this.client.chat(
      "drafter",
      [{ role: "user", content: draftPrompt }],
      cancellation
    );

    if (cancellation?.cancelled) {
      throw new Error("Cancelled");
    }

    // Initialize transcript with initial draft
    const transcript: TranscriptEntry[] = [
      {
        phase: "refinement",
        role: "drafter",
        type: "draft",
        content: currentDraft,
        round: 1,
      },
    ];

    let currentNotes = this.parser.parse(currentDraft);
    let round = 0;

    // Step 2: Refinement loop
    while (round < this.maxRounds) {
      onProgress?.({
        phase: "refining",
        currentRound: round + 1,
        maxRounds: this.maxRounds,
        message: `Refining notes (round ${round + 1})...`,
      });

      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

      // Get critique from critic
      const critiquePrompt = CRITIQUE_PROMPT
        .replace("{title}", article.title)
        .replace("{notes}", currentDraft);

      const critique = await this.client.chat(
        "critic",
        [{ role: "user", content: critiquePrompt }],
        cancellation
      );

      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

      // Add critique to transcript
      transcript.push({
        phase: "refinement",
        role: "critic",
        type: "critique",
        content: critique,
        round: round + 1,
      });

      // Check if approved or marginal (strict matching)
      const status = this.parseCritiqueStatus(critique);

      if (status === "approved" || status === "marginal") {
        return {
          notes: currentNotes,
          rounds: round + 1,
          approved: true,
          transcript,
        };
      }

      // Need revision - send critique to drafter
      round++;

      if (round >= this.maxRounds) {
        break;
      }

      onProgress?.({
        phase: "refining",
        currentRound: round + 1,
        maxRounds: this.maxRounds,
        message: `Revising notes based on feedback (round ${round + 1})...`,
      });

      const revisionPrompt = REVISION_PROMPT
        .replace("{critique}", critique)
        .replace("{notes}", currentDraft);

      currentDraft = await this.client.chat(
        "drafter",
        [
          { role: "user", content: draftPrompt },
          { role: "assistant", content: currentDraft },
          { role: "user", content: revisionPrompt },
        ],
        cancellation
      );

      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

      // Add revision to transcript
      transcript.push({
        phase: "refinement",
        role: "drafter",
        type: "revision",
        content: currentDraft,
        round: round + 1,
      });

      currentNotes = this.parser.parse(currentDraft);
    }

    // Max rounds reached - return best effort
    return {
      notes: currentNotes,
      rounds: this.maxRounds,
      approved: false,
      transcript,
    };
  }

  /**
   * Parse critique response to determine status
   * Uses strict matching: response must START with the keyword
   * This prevents false positives from incidental mentions
   */
  private parseCritiqueStatus(critique: string): "approved" | "marginal" | "needs_work" {
    const trimmedUpper = critique.trim().toUpperCase();

    // Check if response STARTS with approval keyword
    for (const keyword of DIALOGUE.APPROVAL_KEYWORDS) {
      if (trimmedUpper.startsWith(keyword)) {
        return "approved";
      }
    }

    // Check if response STARTS with marginal keyword
    for (const keyword of DIALOGUE.MARGINAL_KEYWORDS) {
      if (trimmedUpper.startsWith(keyword)) {
        return "marginal";
      }
    }

    return "needs_work";
  }
}
