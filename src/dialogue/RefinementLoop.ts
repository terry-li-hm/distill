import { OpenRouterClient } from "../api/OpenRouterClient";
import { AtomicNoteParser } from "../parsing/AtomicNoteParser";
import {
  ExtractedArticle,
  AtomicNote,
  ProgressCallback,
  CancellationToken,
} from "../types";

export interface RefinementResult {
  notes: AtomicNote[];
  rounds: number;
  approved: boolean;
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

If ALL notes meet these criteria and are ready for use, respond with exactly:
APPROVED

If only minor polish is possible but not necessary, respond with:
MARGINAL

Then briefly note what could be slightly better.

If improvements are needed, provide specific, actionable feedback for each note that needs revision. Be direct about what's wrong and how to fix it.`;

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
   */
  async run(
    article: ExtractedArticle,
    interpretation: string,
    onProgress?: ProgressCallback,
    cancellation?: CancellationToken
  ): Promise<RefinementResult> {
    // Step 1: Initial draft from ChatGPT
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

    let currentDraft = await this.client.chat("drafter", [
      { role: "user", content: draftPrompt },
    ]);

    if (cancellation?.cancelled) {
      throw new Error("Cancelled");
    }

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

      // Get critique from Claude
      const critiquePrompt = CRITIQUE_PROMPT
        .replace("{title}", article.title)
        .replace("{notes}", currentDraft);

      const critique = await this.client.chat("critic", [
        { role: "user", content: critiquePrompt },
      ]);

      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

      // Check if approved or marginal
      const status = this.parseCritiqueStatus(critique);

      if (status === "approved") {
        return {
          notes: currentNotes,
          rounds: round + 1,
          approved: true,
        };
      }

      if (status === "marginal") {
        // Marginal improvements only - accept current draft
        return {
          notes: currentNotes,
          rounds: round + 1,
          approved: true,
        };
      }

      // Need revision - send critique to ChatGPT
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

      currentDraft = await this.client.chat("drafter", [
        { role: "user", content: draftPrompt },
        { role: "assistant", content: currentDraft },
        { role: "user", content: revisionPrompt },
      ]);

      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

      currentNotes = this.parser.parse(currentDraft);
    }

    // Max rounds reached - return best effort
    return {
      notes: currentNotes,
      rounds: this.maxRounds,
      approved: false,
    };
  }

  private parseCritiqueStatus(critique: string): "approved" | "marginal" | "needs_work" {
    const upperCritique = critique.toUpperCase().trim();

    if (upperCritique.startsWith("APPROVED") || upperCritique === "APPROVED") {
      return "approved";
    }

    if (upperCritique.startsWith("MARGINAL") || upperCritique.includes("MARGINAL")) {
      return "marginal";
    }

    return "needs_work";
  }
}
