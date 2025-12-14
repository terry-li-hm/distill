import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { ExtractedArticle } from "../types";
import { requestUrl } from "obsidian";
import { URL_VALIDATION } from "../constants";

/**
 * Type definition for linkedom's Document-like object
 * This allows proper typing without unsafe assertions
 */
interface LinkedomDocument {
  documentElement: unknown;
  body: unknown;
  // Readability only needs these basic properties
}

/**
 * Validation result for URL parsing
 */
interface UrlValidationResult {
  valid: boolean;
  url?: URL;
  error?: string;
}

export class ArticleExtractor {
  /**
   * Extract readable content from a URL
   */
  async extract(url: string): Promise<ExtractedArticle> {
    // Validate URL with detailed error messages
    const validation = this.validateUrl(url);
    if (!validation.valid || !validation.url) {
      throw new Error(validation.error || "Invalid URL format");
    }

    // Fetch the page
    const html = await this.fetchPage(validation.url);

    // Parse and extract content
    const article = this.parseArticle(html, validation.url);

    return article;
  }

  /**
   * Validate and parse URL with detailed error reporting
   */
  private validateUrl(input: string): UrlValidationResult {
    let url = input.trim();

    // Check for empty input
    if (!url) {
      return { valid: false, error: "URL cannot be empty" };
    }

    // Add protocol if missing
    if (!url.includes("://")) {
      url = "https://" + url;
    }

    // Parse URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { valid: false, error: "Invalid URL format" };
    }

    // Validate protocol
    if (!URL_VALIDATION.ALLOWED_PROTOCOLS.includes(parsedUrl.protocol as "http:" | "https:")) {
      return {
        valid: false,
        error: `Invalid protocol: ${parsedUrl.protocol}. Only HTTP and HTTPS are supported.`,
      };
    }

    // Validate hostname exists and has valid structure
    const hostname = parsedUrl.hostname;
    if (!hostname) {
      return { valid: false, error: "URL must include a domain name" };
    }

    // Check for localhost/internal addresses (optional security measure)
    if (hostname === "localhost" || hostname.startsWith("127.") || hostname.startsWith("192.168.")) {
      return { valid: false, error: "Local and internal URLs are not supported" };
    }

    // Basic domain structure validation (must have at least one dot for TLD)
    if (!hostname.includes(".")) {
      return { valid: false, error: "Invalid domain: must include a valid TLD (e.g., .com, .org)" };
    }

    // Check minimum URL length
    if (parsedUrl.href.length < URL_VALIDATION.MIN_URL_LENGTH) {
      return { valid: false, error: "URL is too short" };
    }

    return { valid: true, url: parsedUrl };
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
    // Note: linkedom's document is compatible with Readability's requirements
    const reader = new Readability(document as LinkedomDocument as Document, {
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
