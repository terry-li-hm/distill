import { AtomicNote, ValidationResult } from "../types";

export class AtomicNoteParser {
  /**
   * Parse model output into structured atomic notes
   */
  parse(modelOutput: string): AtomicNote[] {
    const notes: AtomicNote[] = [];

    // Split on H3 headings
    const sections = modelOutput.split(/(?=^###\s)/m);

    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed.startsWith("###")) {
        continue;
      }

      const note = this.parseSection(trimmed);
      if (note) {
        notes.push(note);
      }
    }

    return notes;
  }

  private parseSection(section: string): AtomicNote | null {
    const lines = section.split("\n");
    if (lines.length < 2) {
      return null;
    }

    // Extract heading (first line, remove ###)
    const headingLine = lines[0];
    const heading = headingLine.replace(/^###\s*/, "").trim();

    if (!heading) {
      return null;
    }

    // Extract content (remaining lines)
    const contentLines = lines.slice(1).filter((line) => line.trim());
    const content = contentLines.join("\n").trim();

    if (!content) {
      return null;
    }

    // Check for link presence
    const hasLink = /\[.+?\]\(.+?\)/.test(content);

    // Store raw version for display
    const raw = section.trim();

    return {
      heading,
      content,
      hasLink,
      raw,
    };
  }

  /**
   * Validate an atomic note against quality criteria
   */
  validate(note: AtomicNote, articleUrl: string): ValidationResult {
    const issues: string[] = [];

    // Check heading quality
    if (note.heading.length < 10) {
      issues.push("Heading is too short to be descriptive");
    }

    if (note.heading.length > 100) {
      issues.push("Heading is too long");
    }

    // Check content quality
    if (note.content.length < 50) {
      issues.push("Content is too brief");
    }

    if (note.content.length > 1000) {
      issues.push("Content may not be atomic (too long)");
    }

    // Check link presence
    if (!note.hasLink) {
      issues.push("Missing link to source article");
    }

    // Check if link points to the correct URL
    if (note.hasLink && !note.content.includes(articleUrl)) {
      // Check for partial URL match (sometimes models abbreviate)
      const urlDomain = this.extractDomain(articleUrl);
      if (!note.content.includes(urlDomain)) {
        issues.push("Link may not point to the source article");
      }
    }

    // Check for multiple paragraphs (not atomic)
    const paragraphs = note.content.split(/\n\n+/).filter((p) => p.trim());
    if (paragraphs.length > 2) {
      issues.push("Contains multiple paragraphs (may not be atomic)");
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  /**
   * Format notes for display
   */
  formatForDisplay(notes: AtomicNote[]): string {
    return notes.map((note) => note.raw).join("\n\n");
  }

  /**
   * Format notes for saving to vault
   */
  formatForVault(notes: AtomicNote[]): string {
    return notes.map((note) => note.raw).join("\n\n");
  }
}
