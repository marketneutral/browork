#!/usr/bin/env tsx
/**
 * CLI tool for managing MCP server configurations.
 *
 * Usage:
 *   npm run setup-mcp -- add <name> <url> [--transport sse|streamable-http] [--header "Key: Value"]... [--force]
 *   npm run setup-mcp -- remove <name>
 *   npm run setup-mcp -- list
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Load the server's .env so DATA_ROOT resolves to the same DB the server uses.
// This MUST run before importing database.ts, which reads DATA_ROOT at module eval time.
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(__dirname, "../packages/server");
config({ path: resolve(serverDir, ".env") });

// If DATA_ROOT is relative, resolve it from the server directory (not cwd).
if (process.env.DATA_ROOT && !process.env.DATA_ROOT.startsWith("/")) {
  process.env.DATA_ROOT = resolve(serverDir, process.env.DATA_ROOT);
}

// ── Helpers ──

function usage(): never {
  console.error(
    `Usage:
  npm run setup-mcp -- add <name> <url> [--transport sse|streamable-http] [--header "Key: Value"]... [--force]
  npm run setup-mcp -- remove <name>
  npm run setup-mcp -- list

Examples:
  npm run setup-mcp -- add my-tools http://localhost:3099/sse
  npm run setup-mcp -- add prod-api https://mcp.example.com/api --transport streamable-http
  npm run setup-mcp -- add auth-api https://mcp.example.com/sse --header "Authorization: Bearer sk-..."
  npm run setup-mcp -- remove my-tools
  npm run setup-mcp -- list`,
  );
  process.exit(1);
}

function fatal(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

// ── Main (dynamic imports must come after env setup) ──

async function main() {
  const { initDatabase } = await import("../packages/server/src/db/database.js");
  const {
    addMcpServer,
    deleteMcpServer,
    listMcpServers,
    getMcpServer,
  } = await import("../packages/server/src/services/mcp-manager.js");

  initDatabase();

  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const command = args[0];

  if (command === "list") {
    const servers = listMcpServers();
    if (servers.length === 0) {
      console.log("No MCP servers configured.");
    } else {
      console.log(`\n  ${"Name".padEnd(20)} ${"URL".padEnd(45)} ${"Transport".padEnd(18)} Enabled`);
      console.log(`  ${"─".repeat(20)} ${"─".repeat(45)} ${"─".repeat(18)} ${"─".repeat(7)}`);
      for (const s of servers) {
        console.log(
          `  ${s.name.padEnd(20)} ${s.url.padEnd(45)} ${s.transport.padEnd(18)} ${s.enabled ? "yes" : "no"}`,
        );
      }
      console.log();
    }
  } else if (command === "add") {
    const positional: string[] = [];
    let transport: "sse" | "streamable-http" = "sse";
    const headers: Record<string, string> = {};
    let force = false;

    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--force") {
        force = true;
      } else if (args[i] === "--transport") {
        i++;
        const val = args[i];
        if (val !== "sse" && val !== "streamable-http") {
          fatal(`Invalid transport "${val}". Must be "sse" or "streamable-http".`);
        }
        transport = val;
      } else if (args[i] === "--header") {
        i++;
        const val = args[i];
        if (!val) fatal("--header requires a value like \"Key: Value\"");
        const colon = val.indexOf(":");
        if (colon <= 0) fatal(`Invalid header format "${val}". Expected "Key: Value".`);
        headers[val.slice(0, colon).trim()] = val.slice(colon + 1).trim();
      } else {
        positional.push(args[i]);
      }
    }

    if (positional.length !== 2) {
      fatal("add requires <name> and <url>. Run without arguments for usage.");
    }

    const [name, url] = positional;

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      fatal("Server name must contain only letters, numbers, hyphens, and underscores.");
    }

    const existing = getMcpServer(name);
    if (existing && !force) {
      fatal(`Server "${name}" already exists. Use --force to overwrite.`);
    }

    if (existing && force) {
      deleteMcpServer(name);
    }

    const server = addMcpServer({
      name,
      url,
      transport,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    console.log(`Added MCP server "${server.name}" (${server.url}, ${server.transport})`);
  } else if (command === "remove") {
    const name = args[1];
    if (!name) fatal("remove requires a server name.");

    if (!deleteMcpServer(name)) {
      fatal(`Server "${name}" not found.`);
    }

    console.log(`Removed MCP server "${name}".`);
  } else {
    fatal(`Unknown command "${command}". Expected: add, remove, list.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
