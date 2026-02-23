/**
 * Web Search & Web Fetch tools for the Pi agent.
 *
 * web_search — Brave Search API
 * web_fetch  — Fetch URL content as Markdown
 *
 * Registered as Pi SDK customTools (ToolDefinition objects).
 * Only enabled when BRAVE_API_KEY is set.
 */

import { Type } from "@sinclair/typebox";
import TurndownService from "turndown";

// ── Types matching Pi SDK ToolDefinition shape ──

interface ToolResult {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
}

interface ToolDefinitionLike {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute(
    toolCallId: string,
    params: any,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown,
  ): Promise<ToolResult>;
}

// ── Brave Search types ──

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

interface BraveSearchResponse {
  web?: { results?: BraveSearchResult[] };
}

// ── Shared Turndown instance ──

let _turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!_turndown) {
    _turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    // Strip non-content elements
    _turndown.remove(["script", "style", "nav", "footer", "header", "aside", "iframe"]);
  }
  return _turndown;
}

// ── Tool implementations ──

function createWebSearchTool(apiKey: string): ToolDefinitionLike {
  return {
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web using Brave Search. Use this to find current information, documentation, APIs, data sources, or anything else available online.",
    parameters: Type.Object({
      query: Type.String({ description: "The search query" }),
      count: Type.Optional(
        Type.Number({
          description: "Number of results (1-10, default 10)",
          minimum: 1,
          maximum: 10,
          default: 10,
        }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const { query, count = 10 } = params as { query: string; count?: number };

      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(Math.min(count, 10)));

      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          content: [
            {
              type: "text" as const,
              text: `Brave Search API error ${res.status}: ${body}`,
            },
          ],
          details: { error: true, status: res.status },
        };
      }

      const data = (await res.json()) as BraveSearchResponse;
      const results = data.web?.results ?? [];

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No results found for "${query}".` }],
          details: { resultCount: 0 },
        };
      }

      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`,
        )
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text: formatted }],
        details: { resultCount: results.length },
      };
    },
  };
}

const MAX_CONTENT_LENGTH = 20_000;

function createWebFetchTool(): ToolDefinitionLike {
  return {
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch a web page or API endpoint and return its content as Markdown (for HTML) or plain text (for JSON/text). Use this to read documentation, articles, or API responses.",
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch" }),
    }),
    async execute(_toolCallId, params, signal) {
      const { url } = params as { url: string };

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return {
          content: [{ type: "text" as const, text: `Invalid URL: ${url}` }],
          details: { error: true },
        };
      }

      const res = await fetch(parsedUrl.toString(), {
        headers: {
          "User-Agent": "BroworkBot/1.0 (Web Fetch Tool)",
          Accept: "text/html,application/json,text/plain,*/*",
        },
        redirect: "follow",
        signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]),
      });

      if (!res.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Fetch failed: HTTP ${res.status} ${res.statusText}`,
            },
          ],
          details: { error: true, status: res.status },
        };
      }

      const contentType = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      let content: string;

      if (contentType.includes("application/json")) {
        // Pretty-print JSON
        try {
          content = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          content = raw;
        }
      } else if (contentType.includes("text/html")) {
        // HTML → Markdown
        content = getTurndown().turndown(raw);
      } else {
        content = raw;
      }

      // Truncate to stay within LLM context limits
      const truncated = content.length > MAX_CONTENT_LENGTH;
      if (truncated) {
        content = content.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated]";
      }

      return {
        content: [{ type: "text" as const, text: content }],
        details: { url: parsedUrl.toString(), truncated, length: content.length },
      };
    },
  };
}

// ── Public API ──

/**
 * Returns web tool definitions when BRAVE_API_KEY is configured.
 * Returns an empty array when the key is not set (tools silently disabled).
 */
export function createWebTools(): ToolDefinitionLike[] {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    return [];
  }

  return [createWebSearchTool(apiKey), createWebFetchTool()];
}
