#!/usr/bin/env npx tsx
/**
 * Test MCP server with two tools:
 *   random_number(n)  — generate n random numbers as CSV
 *   factorial(x)      — compute factorial of x (memoized)
 *
 * Usage:
 *   npx tsx scripts/test-mcp-server.ts          # default port 3099
 *   PORT=4000 npx tsx scripts/test-mcp-server.ts
 *
 * Then add via CLI:
 *   npm run setup-mcp -- add test-tools http://localhost:3099/sse
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import http from "node:http";
import { z } from "zod";

const PORT = parseInt(process.env.PORT || "3099", 10);

// ── Factorial memo cache ──

const memo = new Map<number, bigint>();

function factorial(x: number): bigint {
  if (x < 0) throw new Error("factorial is not defined for negative numbers");
  if (x <= 1) return 1n;
  if (memo.has(x)) return memo.get(x)!;
  const result = BigInt(x) * factorial(x - 1);
  memo.set(x, result);
  return result;
}

// ── Create a fresh McpServer for each connection ──

function createServer(): McpServer {
  const server = new McpServer({
    name: "test-tools",
    version: "1.0.0",
  });

  server.tool(
    "random_number",
    "Generate N random numbers and return them as CSV",
    { n: z.number().int().min(1).max(10000).default(1).describe("How many random numbers to generate") },
    async ({ n }) => {
      const numbers = Array.from({ length: n }, () => Math.random());
      return {
        content: [{ type: "text", text: numbers.join(",") }],
      };
    },
  );

  server.tool(
    "factorial",
    "Calculate the factorial of a number (memoized)",
    { x: z.number().int().min(0).max(1000).describe("The number to compute factorial of") },
    async ({ x }) => {
      const result = factorial(x);
      return {
        content: [{ type: "text", text: `${x}! = ${result.toString()}` }],
      };
    },
  );

  return server;
}

// ── HTTP + SSE transport ──

const transports = new Map<string, SSEServerTransport>();

const httpServer = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url!, `http://localhost:${PORT}`);

  if (url.pathname === "/sse" && req.method === "GET") {
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);
    res.on("close", () => transports.delete(transport.sessionId));
    // Each SSE connection gets a fresh McpServer instance
    const server = createServer();
    await server.connect(transport);
    return;
  }

  if (url.pathname === "/messages" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unknown session" }));
      return;
    }
    await transport.handlePostMessage(req, res);
    return;
  }

  // Health check
  if (url.pathname === "/" || url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", tools: ["random_number", "factorial"] }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`Test MCP server running on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Tools: random_number, factorial`);
});
