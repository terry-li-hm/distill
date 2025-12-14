import { OpenRouterClient } from "../api/OpenRouterClient";
import {
  ExtractedArticle,
  ProgressCallback,
  CancellationToken,
} from "../types";
import { CONTENT, DIALOGUE } from "../constants";

export interface InterpretationResult {
  aligned: boolean;
  alignedInterpretation: string;
  gptInterpretation: string;
  claudeInterpretation: string;
  rounds: number;
}

const INTERPRETATION_PROMPT = `Read this article and provide your interpretation. Focus on:
1. The core thesis or main argument
2. Key supporting points
3. Notable insights or implications

Keep your interpretation to 2-3 paragraphs.

Article Title: {title}

Article Content:
{content}`;

const ALIGNMENT_CHECK_PROMPT = `Here is another reader's interpretation of the same article "{title}":

{other_interpretation}

Compare this interpretation with your understanding of the article. Do you agree with this interpretation?

If you agree with the interpretation, respond ONLY with the word "ALIGNED" on the first line, then provide a brief summary of the shared understanding (2-3 sentences).

If you disagree, explain specifically what you see differently and provide your refined interpretation. Do NOT include the word "ALIGNED" if you disagree.`;

/**
 * InterpretationPhase manages the initial interpretation alignment between two AI models.
 *
 * Flow:
 * 1. Both models receive the article and generate independent interpretations (in parallel)
 * 2. Model A's interpretation is shared with Model B for alignment check
 * 3. If aligned, we're done. If not, Model B's refinement is shared with Model A
 * 4. This continues until alignment or max rounds reached
 * 5. If max rounds reached without alignment, interpretations are synthesized
 */
export class InterpretationPhase {
  private client: OpenRouterClient;
  private maxRounds: number;

  constructor(client: OpenRouterClient, maxRounds: number) {
    this.client = client;
    this.maxRounds = maxRounds;
  }

  /**
   * Run the interpretation alignment phase
   *
   * @param article - The extracted article to interpret
   * @param onProgress - Optional callback for progress updates
   * @param cancellation - Optional token to cancel the operation
   * @returns InterpretationResult with aligned or synthesized interpretation
   */
  async run(
    article: ExtractedArticle,
    onProgress?: ProgressCallback,
    cancellation?: CancellationToken
  ): Promise<InterpretationResult> {
    // Truncate article content if too long
    const truncatedContent = this.truncateContent(article.content, CONTENT.MAX_ARTICLE_CHARS);

    const interpretationPrompt = INTERPRETATION_PROMPT
      .replace("{title}", article.title)
      .replace("{content}", truncatedContent);

    // Step 1: Get initial interpretations from both models IN PARALLEL
    onProgress?.({
      phase: "interpreting",
      currentRound: 1,
      maxRounds: this.maxRounds,
      message: "Getting initial interpretations...",
    });

    if (cancellation?.cancelled) {
      throw new Error("Cancelled");
    }

    // Parallel requests for initial interpretations
    const [gptInterpretation, claudeInterpretation] = await Promise.all([
      this.client.chat("drafter", [{ role: "user", content: interpretationPrompt }], cancellation),
      this.client.chat("critic", [{ role: "user", content: interpretationPrompt }], cancellation),
    ]);

    if (cancellation?.cancelled) {
      throw new Error("Cancelled");
    }

    // Step 2: Alignment loop - exchange interpretations until convergence
    let currentGptInterpretation = gptInterpretation;
    let currentClaudeInterpretation = claudeInterpretation;
    let round = 1;

    while (round < this.maxRounds) {
      onProgress?.({
        phase: "interpreting",
        currentRound: round + 1,
        maxRounds: this.maxRounds,
        message: `Aligning interpretations (round ${round + 1})...`,
      });

      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

      // Share GPT's interpretation with Claude and check alignment
      const alignmentPrompt = ALIGNMENT_CHECK_PROMPT
        .replace("{title}", article.title)
        .replace("{other_interpretation}", currentGptInterpretation);

      const claudeResponse = await this.client.chat(
        "critic",
        [
          { role: "user", content: interpretationPrompt },
          { role: "assistant", content: currentClaudeInterpretation },
          { role: "user", content: alignmentPrompt },
        ],
        cancellation
      );

      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

      // Check if Claude signals alignment (must start with ALIGNED)
      if (this.isAligned(claudeResponse)) {
        const alignedSummary = this.extractAlignedSummary(claudeResponse, currentGptInterpretation);
        return {
          aligned: true,
          alignedInterpretation: alignedSummary,
          gptInterpretation: currentGptInterpretation,
          claudeInterpretation: currentClaudeInterpretation,
          rounds: round + 1,
        };
      }

      // Claude disagreed - update their interpretation
      currentClaudeInterpretation = claudeResponse;
      round++;

      if (round >= this.maxRounds) {
        break;
      }

      // Share Claude's refined interpretation with GPT
      const gptAlignmentPrompt = ALIGNMENT_CHECK_PROMPT
        .replace("{title}", article.title)
        .replace("{other_interpretation}", currentClaudeInterpretation);

      const gptResponse = await this.client.chat(
        "drafter",
        [
          { role: "user", content: interpretationPrompt },
          { role: "assistant", content: currentGptInterpretation },
          { role: "user", content: gptAlignmentPrompt },
        ],
        cancellation
      );

      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

      // Check if GPT signals alignment
      if (this.isAligned(gptResponse)) {
        const alignedSummary = this.extractAlignedSummary(gptResponse, currentClaudeInterpretation);
        return {
          aligned: true,
          alignedInterpretation: alignedSummary,
          gptInterpretation: currentGptInterpretation,
          claudeInterpretation: currentClaudeInterpretation,
          rounds: round + 1,
        };
      }

      currentGptInterpretation = gptResponse;
      round++;
    }

    // Max rounds reached - synthesize interpretations
    const combinedInterpretation = this.combineInterpretations(
      currentGptInterpretation,
      currentClaudeInterpretation
    );

    return {
      aligned: false,
      alignedInterpretation: combinedInterpretation,
      gptInterpretation: currentGptInterpretation,
      claudeInterpretation: currentClaudeInterpretation,
      rounds: this.maxRounds,
    };
  }

  /**
   * Truncate content at word boundary with notice
   */
  private truncateContent(content: string, maxChars: number): string {
    if (content.length <= maxChars) {
      return content;
    }
    const truncated = content.slice(0, maxChars);
    const lastSpace = truncated.lastIndexOf(" ");
    return truncated.slice(0, lastSpace) + "\n\n[Content truncated for length]";
  }

  /**
   * Check if a response indicates alignment
   * Uses strict matching: response must START with an alignment keyword
   * This prevents false positives from incidental mentions of "aligned" in text
   */
  private isAligned(response: string): boolean {
    const trimmedUpper = response.trim().toUpperCase();

    // Check if response STARTS with any alignment keyword
    for (const keyword of DIALOGUE.ALIGNMENT_KEYWORDS) {
      if (trimmedUpper.startsWith(keyword)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract the summary portion after the alignment keyword
   */
  private extractAlignedSummary(response: string, fallback: string): string {
    const trimmed = response.trim();
    const upperTrimmed = trimmed.toUpperCase();

    // Find and remove the alignment keyword to get the summary
    for (const keyword of DIALOGUE.ALIGNMENT_KEYWORDS) {
      if (upperTrimmed.startsWith(keyword)) {
        const afterKeyword = trimmed.slice(keyword.length).trim();
        // Remove any leading punctuation or newlines
        const summary = afterKeyword.replace(/^[\s.,:\-\n]+/, "").trim();
        if (summary.length > 50) {
          return summary;
        }
        break;
      }
    }

    return fallback;
  }

  /**
   * Combine two interpretations when alignment wasn't reached
   */
  private combineInterpretations(gpt: string, claude: string): string {
    return `Synthesized understanding from multiple perspectives:

${gpt}

Additional perspective:
${claude}`;
  }
}
