import { App, TFile, normalizePath } from "obsidian";
import { DistillSettings, AtomicNote, ExtractedArticle } from "../types";

export class InboxWriter {
  private app: App;
  private settings: DistillSettings;

  constructor(app: App, settings: DistillSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Append atomic notes to the inbox file
   */
  async append(notes: AtomicNote[], source: ExtractedArticle): Promise<void> {
    const inboxPath = normalizePath(this.settings.inboxPath);

    // Get or create inbox file
    let inboxFile = this.app.vault.getAbstractFileByPath(inboxPath);

    if (!inboxFile) {
      // Create the inbox file
      inboxFile = await this.app.vault.create(inboxPath, this.getInitialContent());
    }

    if (!(inboxFile instanceof TFile)) {
      throw new Error(`${inboxPath} is not a file`);
    }

    // Format the notes section
    const notesSection = this.formatNotesSection(notes, source);

    // Append to file
    const currentContent = await this.app.vault.read(inboxFile);
    const newContent = currentContent + notesSection;

    await this.app.vault.modify(inboxFile, newContent);
  }

  private getInitialContent(): string {
    return `# Inbox

This note collects atomic notes distilled from articles.

---

`;
  }

  private formatNotesSection(notes: AtomicNote[], source: ExtractedArticle): string {
    const date = new Date().toISOString().split("T")[0];
    const time = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const lines: string[] = [
      "",
      `## Distilled: ${source.title}`,
      "",
      `<!-- Source: ${source.url} -->`,
      `<!-- Distilled on: ${date} at ${time} -->`,
      "",
    ];

    // Add each note
    for (const note of notes) {
      lines.push(note.raw);
      lines.push("");
    }

    lines.push("---");
    lines.push("");

    return lines.join("\n");
  }
}
