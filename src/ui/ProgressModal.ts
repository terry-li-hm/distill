import { App, Modal, Notice } from "obsidian";
import type DistillPlugin from "../main";
import { DialogueOrchestrator } from "../dialogue/DialogueOrchestrator";
import { ApprovalModal } from "./ApprovalModal";
import {
  ExtractedArticle,
  ProgressUpdate,
  createCancellationToken,
  CancellationToken,
  DialogueTranscript,
} from "../types";

export class ProgressModal extends Modal {
  private plugin: DistillPlugin;
  private article: ExtractedArticle;
  private cancellation: CancellationToken;
  private phaseEl: HTMLElement;
  private messageEl: HTMLElement;
  private progressBarFill: HTMLElement;

  constructor(app: App, plugin: DistillPlugin, article: ExtractedArticle) {
    super(app);
    this.plugin = plugin;
    this.article = article;
    this.cancellation = createCancellationToken();
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("distill-progress-modal");

    // Header
    contentEl.createEl("h2", { text: "Distilling Article" });

    // Article info
    const articleInfo = contentEl.createDiv({ cls: "distill-article-info" });
    articleInfo.createEl("strong", { text: this.article.title });
    articleInfo.createEl("span", {
      text: ` (${this.article.siteName || new URL(this.article.url).hostname})`,
      cls: "distill-article-source",
    });

    // Progress display
    const progressContainer = contentEl.createDiv({ cls: "distill-progress-container" });

    this.phaseEl = progressContainer.createDiv({ cls: "distill-phase" });
    this.phaseEl.setText("Initializing...");

    // Progress bar
    const progressBar = progressContainer.createDiv({ cls: "distill-progress-bar" });
    this.progressBarFill = progressBar.createDiv({ cls: "distill-progress-bar-fill" });

    this.messageEl = progressContainer.createDiv({ cls: "distill-message" });
    this.messageEl.setText("Starting dialogue between ChatGPT and Claude...");

    // Cancel button
    const buttonContainer = contentEl.createDiv({ cls: "distill-button-container" });
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.cancellation.cancel();
      this.close();
      new Notice("Distillation cancelled");
    });

    // Start the dialogue
    this.runDialogue();
  }

  private async runDialogue(): Promise<void> {
    const orchestrator = new DialogueOrchestrator(this.plugin.settings);

    try {
      const result = await orchestrator.process(
        this.article,
        (update) => this.handleProgress(update),
        this.cancellation
      );

      if (this.cancellation.cancelled) {
        return;
      }

      // Check for errors
      if (result.state.phase === "error") {
        this.close();
        new Notice(`Distillation failed: ${result.state.error}`);
        return;
      }

      // Check for empty results
      if (result.atomicNotes.length === 0) {
        this.close();
        new Notice("No atomic notes were generated. The article may not have extractable insights.");
        return;
      }

      // Close progress modal and open approval modal
      this.close();
      new ApprovalModal(
        this.app,
        this.plugin,
        this.article,
        result.atomicNotes,
        result.transcript,
        result.state.interpretationRounds,
        result.state.refinementRounds
      ).open();
    } catch (error) {
      if (this.cancellation.cancelled) {
        return;
      }

      this.close();
      const message = error instanceof Error ? error.message : "Unknown error";
      new Notice(`Distillation failed: ${message}`);
    }
  }

  private handleProgress(update: ProgressUpdate): void {
    // Update phase display
    const phaseLabels: Record<string, string> = {
      interpreting: "Interpreting",
      aligned: "Aligned",
      drafting: "Drafting",
      refining: "Refining",
      complete: "Complete",
      error: "Error",
    };

    let phaseText = phaseLabels[update.phase] || update.phase;
    if (update.currentRound && update.maxRounds) {
      phaseText += ` (${update.currentRound}/${update.maxRounds})`;
    }
    this.phaseEl.setText(phaseText);

    // Update message
    this.messageEl.setText(update.message);

    // Update progress bar
    const progress = this.calculateProgress(update);
    this.progressBarFill.style.width = `${progress}%`;
  }

  private calculateProgress(update: ProgressUpdate): number {
    // Rough progress estimation based on phase
    const phaseWeights: Record<string, { base: number; perRound: number }> = {
      interpreting: { base: 0, perRound: 15 },
      aligned: { base: 45, perRound: 0 },
      drafting: { base: 50, perRound: 0 },
      refining: { base: 55, perRound: 15 },
      complete: { base: 100, perRound: 0 },
    };

    const weight = phaseWeights[update.phase] || { base: 0, perRound: 0 };
    let progress = weight.base;

    if (update.currentRound && update.maxRounds && weight.perRound > 0) {
      progress += (update.currentRound / update.maxRounds) * weight.perRound;
    }

    return Math.min(progress, 100);
  }

  onClose(): void {
    this.cancellation.cancel();
    this.contentEl.empty();
  }
}
