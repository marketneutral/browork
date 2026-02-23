import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWebTools } from "../tools/web-tools.js";

describe("createWebTools", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns empty array when BRAVE_API_KEY is not set", () => {
    delete process.env.BRAVE_API_KEY;
    expect(createWebTools()).toEqual([]);
  });

  it("returns two tools when BRAVE_API_KEY is set", () => {
    process.env.BRAVE_API_KEY = "test-key";
    const tools = createWebTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("web_search");
    expect(tools[1].name).toBe("web_fetch");
  });

  it("tools have required ToolDefinition fields", () => {
    process.env.BRAVE_API_KEY = "test-key";
    const tools = createWebTools();
    for (const tool of tools) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("label");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("parameters");
      expect(typeof tool.execute).toBe("function");
    }
  });
});

describe("web_search tool", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, BRAVE_API_KEY: "test-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("calls Brave Search API and formats results", async () => {
    const mockResponse = {
      web: {
        results: [
          { title: "Result One", url: "https://example.com/1", description: "First result" },
          { title: "Result Two", url: "https://example.com/2", description: "Second result" },
        ],
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const tools = createWebTools();
    const searchTool = tools[0];
    const result = await searchTool.execute("tc-1", { query: "test query" }, undefined, undefined, undefined);

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const fetchUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(fetchUrl).toContain("api.search.brave.com");
    expect(fetchUrl).toContain("q=test+query");

    const fetchOpts = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
    expect(fetchOpts.headers).toHaveProperty("X-Subscription-Token", "test-key");

    expect(result.content[0].text).toContain("Result One");
    expect(result.content[0].text).toContain("https://example.com/1");
    expect(result.content[0].text).toContain("Result Two");
    expect(result.details).toEqual({ resultCount: 2 });
  });

  it("handles empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ web: { results: [] } }),
    } as Response);

    const tools = createWebTools();
    const result = await tools[0].execute("tc-1", { query: "nothing" }, undefined, undefined, undefined);

    expect(result.content[0].text).toContain("No results found");
    expect(result.details).toEqual({ resultCount: 0 });
  });

  it("handles API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("rate limited"),
    } as unknown as Response);

    const tools = createWebTools();
    const result = await tools[0].execute("tc-1", { query: "test" }, undefined, undefined, undefined);

    expect(result.content[0].text).toContain("error 429");
    expect(result.details).toEqual({ error: true, status: 429 });
  });
});

describe("web_fetch tool", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, BRAVE_API_KEY: "test-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("fetches HTML and converts to Markdown", async () => {
    const html = `<html><body><h1>Hello World</h1><p>Some content here.</p></body></html>`;

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      text: () => Promise.resolve(html),
    } as Response);

    const tools = createWebTools();
    const fetchTool = tools[1];
    const result = await fetchTool.execute("tc-1", { url: "https://example.com/page" }, undefined, undefined, undefined);

    expect(result.content[0].text).toContain("Hello World");
    expect(result.content[0].text).toContain("Some content here.");
    expect(result.details).toMatchObject({ url: "https://example.com/page", truncated: false });
  });

  it("handles JSON responses", async () => {
    const json = JSON.stringify({ data: [1, 2, 3] });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve(json),
    } as Response);

    const tools = createWebTools();
    const result = await tools[1].execute("tc-1", { url: "https://api.example.com/data" }, undefined, undefined, undefined);

    expect(result.content[0].text).toContain('"data"');
    expect(result.content[0].text).toContain("[\n");
  });

  it("handles fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    const tools = createWebTools();
    const result = await tools[1].execute("tc-1", { url: "https://example.com/missing" }, undefined, undefined, undefined);

    expect(result.content[0].text).toContain("HTTP 404");
    expect(result.details).toEqual({ error: true, status: 404 });
  });

  it("handles invalid URL", async () => {
    const tools = createWebTools();
    const result = await tools[1].execute("tc-1", { url: "not-a-url" }, undefined, undefined, undefined);

    expect(result.content[0].text).toContain("Invalid URL");
    expect(result.details).toEqual({ error: true });
  });

  it("truncates long content", async () => {
    const longContent = "x".repeat(25_000);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve(longContent),
    } as Response);

    const tools = createWebTools();
    const result = await tools[1].execute("tc-1", { url: "https://example.com/big" }, undefined, undefined, undefined);

    expect(result.content[0].text).toContain("[Content truncated]");
    expect(result.details).toMatchObject({ truncated: true });
  });
});
