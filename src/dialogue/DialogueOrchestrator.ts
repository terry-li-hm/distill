import { OpenRouterClient } from "../api/OpenRouterClient";
import { InterpretationPhase } from "./InterpretationPhase";
import { RefinementLoop } from "./RefinementLoop";
import {
  DistillSettings,
  ExtractedArticle,
  DialogueResult,
  DialogueState,
  ProgressCallback,
  CancellationToken,
} from "../types";

export class DialogueOrchestrator {
  private client: OpenRouterClient;
  private interpretationPhase: InterpretationPhase;
  private refinementLoop: RefinementLoop;

  constructor(settings: DistillSettings) {
    this.client = new OpenRouterClient({
      apiKey: settings.openRouterApiKey,
      drafterModel: settings.drafterModel,
      criticModel: settings.criticModel,
    });

    this.interpretationPhase = new InterpretationPhase(
      this.client,
      settings.maxInterpretationRounds
    );

    this.refinementLoop = new RefinementLoop(
      this.client,
      settings.maxRefinementRounds
    );
  }

  /**
   * Run the full dialogue workflow
   */
  async process(
    article: ExtractedArticle,
    onProgress?: ProgressCallback,
    cancellation?: CancellationToken
  ): Promise<DialogueResult> {
    const state: DialogueState = {
      phase: "interpreting",
      interpretationRounds: 0,
      refinementRounds: 0,
    };

    try {
      // Phase 1: Interpretation alignment
      onProgress?.({
        phase: "interpreting",
        currentRound: 1,
        maxRounds: 3,
        message: "Starting interpretation phase...",
      });

      const interpretationResult = await this.interpretationPhase.run(
        article,
        onProgress,
        cancellation
      );

      state.interpretationRounds = interpretationResult.rounds;
      state.gptInterpretation = interpretationResult.gptInterpretation;
      state.claudeInterpretation = interpretationResult.claudeInterpretation;
      state.alignedInterpretation = interpretationResult.alignedInterpretation;
      state.phase = "aligned";

      if (cancellation?.cancelled) {
        throw new Error("Cancelled");
      }

      // Phase 2: Drafting and refinement
      onProgress?.({
        phase: "drafting",
        message: "Starting drafting phase...",
      });

      state.phase = "drafting";

      const refinementResult = await this.refinementLoop.run(
        article,
        interpretationResult.alignedInterpretation,
        onProgress,
        cancellation
      );

      state.refinementRounds = refinementResult.rounds;
      state.currentDraft = refinementResult.notes;
      state.phase = "complete";

      return {
        article,
        state,
        atomicNotes: refinementResult.notes,
        totalApiCalls: this.client.getCallCount(),
      };
    } catch (error) {
      state.phase = "error";
      state.error = error instanceof Error ? error.message : "Unknown error";

      // Return partial results if available
      return {
        article,
        state,
        atomicNotes: state.currentDraft || [],
        totalApiCalls: this.client.getCallCount(),
      };
    }
  }

  /**
   * Reset the orchestrator state for a new dialogue
   * Useful when reusing the orchestrator for multiple articles
   */
  reset(): void {
    this.client.resetCallCount();
  }

  /**
   * Get the current API call count
   */
  getApiCallCount(): number {
    return this.client.getCallCount();
  }
}
