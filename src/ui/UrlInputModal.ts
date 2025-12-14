import { App, Modal, Notice } from "obsidian";
import type DistillPlugin from "../main";
import { ArticleExtractor } from "../extraction/ArticleExtractor";
import { ProgressModal } from "./ProgressModal";

export class UrlInputModal extends Modal {
  private plugin: DistillPlugin;
  private urlInput: HTMLInputElement;
  private submitBtn: HTMLButtonElement;

  constructor(app: App, plugin: DistillPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("distill-url-modal");

    contentEl.createEl("h2", { text: "Distill Article" });

    // URL input
    const inputContainer = contentEl.createDiv({ cls: "distill-input-container" });

    inputContainer.createEl("label", {
      text: "Article URL",
      attr: { for: "distill-url-input" },
    });

    this.urlInput = inputContainer.createEl("input", {
      type: "url",
      placeholder: "https://example.com/article",
      cls: "distill-url-input",
      attr: { id: "distill-url-input" },
    });

    // Handle Enter key
    this.urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.handleSubmit();
      }
    });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "distill-button-container" });

    this.submitBtn = buttonContainer.createEl("button", {
      text: "Distill",
      cls: "mod-cta",
    });
    this.submitBtn.addEventListener("click", () => this.handleSubmit());

    const cancelBtn = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelBtn.addEventListener("click", () => this.close());

    // Focus the input
    this.urlInput.focus();

    // Try to paste from clipboard
    this.tryPasteClipboard();
  }

  private async tryPasteClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith("http://") || text.startsWith("https://"))) {
        this.urlInput.value = text;
        this.urlInput.select();
      }
    } catch {
      // Clipboard access denied or empty, ignore
    }
  }

  private async handleSubmit(): Promise<void> {
    const url = this.urlInput.value.trim();

    if (!url) {
      new Notice("Please enter a URL");
      return;
    }

    // Disable inputs during processing
    this.urlInput.disabled = true;
    this.submitBtn.disabled = true;
    this.submitBtn.setText("Extracting...");

    try {
      // Extract article
      const extractor = new ArticleExtractor();
      const article = await extractor.extract(url);

      // Close this modal
      this.close();

      // Open progress modal to run dialogue
      new ProgressModal(this.app, this.plugin, article).open();
    } catch (error) {
      // Re-enable inputs
      this.urlInput.disabled = false;
      this.submitBtn.disabled = false;
      this.submitBtn.setText("Distill");

      const message = error instanceof Error ? error.message : "Unknown error";
      new Notice(`Failed to extract article: ${message}`);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
