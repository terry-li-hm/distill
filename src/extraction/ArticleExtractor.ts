import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { ExtractedArticle } from "../types";
import { requestUrl } from "obsidian";

export class ArticleExtractor {
  /**
   * Extract readable content from a URL
   */
  async extract(url: string): Promise<ExtractedArticle> {
    // Validate URL
    const parsedUrl = this.parseUrl(url);
    if (!parsedUrl) {
      throw new Error("Invalid URL format");
    }

    // Fetch the page
    const html = await this.fetchPage(parsedUrl);

    // Parse and extract content
    const article = this.parseArticle(html, parsedUrl);

    return article;
  }

  private parseUrl(url: string): URL | null {
    try {
      // Add protocol if missing
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }
      return new URL(url);
    } catch {
      return null;
    }
  }

  private async fetchPage(url: URL): Promise<string> {
    try {
      const response = await requestUrl({
        url: url.toString(),
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Obsidian Distill Plugin)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.text || "Failed to fetch"}`);
      }

      return response.text;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch article: ${error.message}`);
      }
      throw new Error("Failed to fetch article: Unknown error");
    }
  }

  private parseArticle(html: string, url: URL): ExtractedArticle {
    // Parse HTML using linkedom
    const { document } = parseHTML(html);

    // Use Readability to extract article content
    const reader = new Readability(document as unknown as Document, {
      charThreshold: 100,
    });

    const article = reader.parse();

    if (!article) {
      throw new Error("Could not extract article content. The page may be behind a paywall or heavily JavaScript-dependent.");
    }

    // Clean and format the content
    const cleanContent = this.cleanContent(article.textContent);

    return {
      title: article.title || this.extractTitleFromUrl(url),
      content: cleanContent,
      url: url.toString(),
      siteName: article.siteName || url.hostname,
      excerpt: article.excerpt || undefined,
    };
  }

  private cleanContent(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\s+/g, " ")
      // Remove excessive newlines
      .replace(/\n{3,}/g, "\n\n")
      // Trim
      .trim();
  }

  private extractTitleFromUrl(url: URL): string {
    // Try to extract a reasonable title from the URL path
    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (pathSegments.length > 0) {
      const lastSegment = pathSegments[pathSegments.length - 1];
      // Remove file extensions and convert dashes/underscores to spaces
      return lastSegment
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return url.hostname;
  }
}
