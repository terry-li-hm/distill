import { App, Modal, Notice } from "obsidian";
import type DistillPlugin from "../main";
import { InboxWriter } from "../output/InboxWriter";
import { ExtractedArticle, AtomicNote } from "../types";

export class ApprovalModal extends Modal {
  private plugin: DistillPlugin;
  private article: ExtractedArticle;
  private notes: AtomicNote[];
  private selectedNotes: Set<AtomicNote>;
  private statsEl: HTMLElement;

  constructor(
    app: App,
    plugin: DistillPlugin,
    article: ExtractedArticle,
    notes: AtomicNote[]
  ) {
    super(app);
    this.plugin = plugin;
    this.article = article;
    this.notes = notes;
    this.selectedNotes = new Set(notes); // All selected by default
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("distill-approval-modal");

    // Header
    contentEl.createEl("h2", { text: "Review Atomic Notes" });

    // Article info
    const articleInfo = contentEl.createDiv({ cls: "distill-article-info" });
    articleInfo.createEl("strong", { text: this.article.title });

    // Stats
    this.statsEl = contentEl.createDiv({ cls: "distill-stats" });
    this.updateStats();

    // Bulk actions
    const actionsEl = contentEl.createDiv({ cls: "distill-bulk-actions" });

    const selectAllBtn = actionsEl.createEl("button", { text: "Select All" });
    selectAllBtn.addEventListener("click", () => this.selectAll());

    const deselectAllBtn = actionsEl.createEl("button", { text: "Deselect All" });
    deselectAllBtn.addEventListener("click", () => this.deselectAll());

    // Notes list
    const listContainer = contentEl.createDiv({ cls: "distill-note-list" });

    for (const note of this.notes) {
      this.renderNoteItem(listContainer, note);
    }

    // Action buttons
    const buttonContainer = contentEl.createDiv({ cls: "distill-button-container" });

    const acceptBtn = buttonContainer.createEl("button", {
      text: "Add to Inbox",
      cls: "mod-cta",
    });
    acceptBtn.addEventListener("click", () => this.handleAccept());

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
  }

  private renderNoteItem(container: HTMLElement, note: AtomicNote): void {
    const isSelected = this.selectedNotes.has(note);

    const item = container.createDiv({
      cls: `distill-note-item ${isSelected ? "is-selected" : ""}`,
    });

    // Checkbox
    const checkbox = item.createEl("input", { type: "checkbox" });
    checkbox.checked = isSelected;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        this.selectedNotes.add(note);
      } else {
        this.selectedNotes.delete(note);
      }
      item.toggleClass("is-selected", checkbox.checked);
      this.updateStats();
    });

    // Note content
    const noteContent = item.createDiv({ cls: "distill-note-content" });

    // Heading
    noteContent.createEl("h4", {
      text: note.heading,
      cls: "distill-note-heading",
    });

    // Content preview
    const preview = noteContent.createDiv({ cls: "distill-note-preview" });
    preview.setText(this.truncateText(note.content, 200));

    // Validation indicators
    if (!note.hasLink) {
      const warning = noteContent.createDiv({ cls: "distill-note-warning" });
      warning.setText("Missing article link");
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength).trim() + "...";
  }

  private updateStats(): void {
    const selected = this.selectedNotes.size;
    const total = this.notes.length;
    const totalChars = Array.from(this.selectedNotes).reduce(
      (sum, note) => sum + note.raw.length,
      0
    );
    const estimatedTokens = Math.ceil(totalChars / 4);

    this.statsEl.empty();
    this.statsEl.createSpan({ text: `${selected}/${total} notes selected` });
    this.statsEl.createSpan({ text: " | " });
    this.statsEl.createSpan({ text: `~${estimatedTokens.toLocaleString()} chars` });
  }

  private selectAll(): void {
    this.selectedNotes = new Set(this.notes);
    this.refreshList();
    this.updateStats();
  }

  private deselectAll(): void {
    this.selectedNotes.clear();
    this.refreshList();
    this.updateStats();
  }

  private refreshList(): void {
    const checkboxes = this.contentEl.querySelectorAll<HTMLInputElement>(
      ".distill-note-item input[type=checkbox]"
    );
    const items = this.contentEl.querySelectorAll(".distill-note-item");

    checkboxes.forEach((checkbox, index) => {
      const note = this.notes[index];
      const isSelected = this.selectedNotes.has(note);
      checkbox.checked = isSelected;
      items[index].toggleClass("is-selected", isSelected);
    });
  }

  private async handleAccept(): Promise<void> {
    if (this.selectedNotes.size === 0) {
      new Notice("No notes selected");
      return;
    }

    try {
      const writer = new InboxWriter(this.app, this.plugin.settings);
      const selectedArray = Array.from(this.selectedNotes);

      await writer.append(selectedArray, this.article);

      this.close();
      new Notice(
        `Added ${selectedArray.length} note(s) to ${this.plugin.settings.inboxPath}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      new Notice(`Failed to save notes: ${message}`);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
