import { OpenRouterClient } from "../api/OpenRouterClient";
import {
  ExtractedArticle,
  ChatMessage,
  ProgressCallback,
  CancellationToken,
} from "../types";

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

If you agree with the interpretation, respond with:
ALIGNED

Then provide a brief summary of the shared understanding (2-3 sentences).

If you disagree, explain specifically what you see differently and provide your refined interpretation.`;

export class InterpretationPhase {
  private client: OpenRouterClient;
  private maxRounds: number;

  constructor(client: OpenRouterClient, maxRounds: number) {
    this.client = client;
    this.maxRounds = maxRounds;
  }

  /**
   * Run the interpretation alignment phase
   */
  async run(
    article: ExtractedArticle,
    onProgress?: ProgressCallback,
    cancellation?: CancellationToken
  ): Promise<InterpretationResult> {
    // Truncate article content if too long (keep under ~6000 words for context)
    const truncatedContent = this.truncateContent(article.content, 24000);

    // Step 1: Get initial interpretations from both models in parallel
    onProgress?.({
      phase: "interpreting",
      currentRound: 1,
      maxRounds: this.maxRounds,
      message: "Getting initial interpretations...",
    });

    if (cancellation?.cancelled) {
      throw new Error("Cancelled");
    }

    const interpretationPrompt = INTERPRETATION_PROMPT
      .replace("{title}", article.title)
      .replace("{content}", truncatedContent);

    // Get interpretations (could parallelize but keeping simple for now)
    const gptInterpretation = await this.client.chat("drafter", [
      { role: "user", content: interpretationPrompt },
    ]);

    if (cancellation?.cancelled) {
      throw new Error("Cancelled");
    }

    const claudeInterpretation = await this.client.chat("critic", [
      { role: "user", content: interpretationPrompt },
    ]);

    if (cancellation?.cancelled) {
      throw new Error("Cancelled");
    }

    // Step 2: Check for alignment
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

      const claudeResponse = await this.client.chat("critic", [
        { role: "user", content: interpretationPrompt },
        { role: "assistant", content: currentClaudeInterpretation },
        { role: "user", content: alignmentPrompt },
      ]);

      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

      // Check if Claude signals alignment
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

      // Claude disagreed - get their refined interpretation
      currentClaudeInterpretation = claudeResponse;

      // Share Claude's refined interpretation with GPT
      round++;

      if (round >= this.maxRounds) {
        break;
      }

      const gptAlignmentPrompt = ALIGNMENT_CHECK_PROMPT
        .replace("{title}", article.title)
        .replace("{other_interpretation}", currentClaudeInterpretation);

      const gptResponse = await this.client.chat("drafter", [
        { role: "user", content: interpretationPrompt },
        { role: "assistant", content: currentGptInterpretation },
        { role: "user", content: gptAlignmentPrompt },
      ]);

      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

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

    // Max rounds reached - use combined interpretation
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

  private truncateContent(content: string, maxChars: number): string {
    if (content.length <= maxChars) {
      return content;
    }
    // Truncate at word boundary
    const truncated = content.slice(0, maxChars);
    const lastSpace = truncated.lastIndexOf(" ");
    return truncated.slice(0, lastSpace) + "\n\n[Content truncated for length]";
  }

  private isAligned(response: string): boolean {
    const upperResponse = response.toUpperCase();
    return (
      upperResponse.includes("ALIGNED") ||
      upperResponse.includes("I AGREE") ||
      upperResponse.includes("WE AGREE")
    );
  }

  private extractAlignedSummary(response: string, fallback: string): string {
    // Try to extract the summary after "ALIGNED"
    const alignedIndex = response.toUpperCase().indexOf("ALIGNED");
    if (alignedIndex !== -1) {
      const afterAligned = response.slice(alignedIndex + 7).trim();
      if (afterAligned.length > 50) {
        return afterAligned;
      }
    }
    return fallback;
  }

  private combineInterpretations(gpt: string, claude: string): string {
    // Create a merged interpretation from both perspectives
    return `Synthesized understanding from multiple perspectives:

${gpt}

Additional perspective:
${claude}`;
  }
}
