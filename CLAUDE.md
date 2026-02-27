# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is #opentowork?

A web UI for non-technical financial analysts to operate the Pi coding agent. Analysts upload data files, chat with Pi through a browser, and download results — no terminal needed.

The user-facing app name is configurable via `VITE_APP_NAME` env var (default: `#opentowork`). Internal package names and code identifiers still use `browork`.

## Commands

```bash
npm install              # Install all workspace dependencies
npm run dev              # Run both server (:3001) and web (:5173) concurrently
npm run dev:server       # Backend only (tsx watch, hot reload)
npm run dev:web          # Frontend only (Vite dev server, proxies /api to :3001)
npm test                 # Run server-side Vitest tests (~179 tests)
npm run build            # Build server (tsc) then web (tsc + vite build)
npm run lint             # ESLint across all packages
npm run install-skill -- <repo-url> <skill-name>  # Install a single skill from a remote repo
```

Single test file: `npx vitest run packages/server/src/__tests__/safe-path.test.ts`
Watch mode: `npm run test:watch --workspace=packages/server`

## Architecture

**Monorepo** (`npm workspaces`) with three packages under `packages/`:

### `packages/server` — Fastify 5 backend
- **Entry**: `src/index.ts`
- **Routes** (`src/routes/`): REST endpoints for auth, sessions, files, skills, health, MCP
- **Services** (`src/services/`): Pi SDK wrapper (with mock fallback), skill manager, file watcher (chokidar), MCP client manager, sandbox manager
- **Tools** (`src/tools/`): Custom Pi tools — web search/fetch (`web-tools.ts`), MCP bridge (`mcp-bridge.ts`)
- **WebSocket** (`src/ws/session-stream.ts`): Streams Pi agent events to the client in real-time
- **Database** (`src/db/`): SQLite via better-sqlite3 (WAL mode), no ORM — direct prepared statements. Tables: users, tokens, sessions, messages, mcp_servers
- **Auth** (`src/plugins/auth.ts`): Bearer token validation as a Fastify plugin; scrypt password hashing
- **Zip handling**: Uploaded `.zip` files are auto-extracted server-side (adm-zip). Download-all-as-zip endpoint for workspace export.
- **Tests** (`src/__tests__/`): Vitest with temp directory + test DB per suite

### `packages/web` — React 19 SPA
- **Build**: Vite 6 with `@` path alias → `./src/`
- **Styling**: Tailwind CSS 4 (v4 `@theme` tokens, `@tailwindcss/vite` plugin). Base font: Plus Jakarta Sans at 17px. No serif fonts.
- **State**: Zustand stores in `src/stores/` — session (messages, streaming), files, skills, auth (localStorage-backed)
- **Layout**: 3-panel (`src/components/layout/AppLayout.tsx`) — collapsible sidebar, chat panel, resizable file panel
- **File tree**: react-arborist with drag-and-drop move, inline rename, per-file download, and colored Lucide file-type icons (`FileIcon` component in `FileTree.tsx`)
- **Editors**: CodeMirror (code), AG Grid (CSV), Markdown editor (`@uiw/react-md-editor`) in `src/components/files/editors/`
- **Viewers**: Image, PDF, and HTML (sandboxed iframe with source toggle) in `src/components/files/viewers/`
- **Chat**: Message bubbles + rich tool call cards (`ToolCallCard.tsx`) with terminal-style bash output, color-coded diffs for edits, and expandable result details
- **App config**: `src/config.ts` exports `APP_NAME` from `VITE_APP_NAME` env var
- **WebSocket hook**: `src/hooks/useWebSocket.ts` with automatic reconnection and backoff
- **API client**: `src/api/client.ts` — centralized REST + WebSocket URL helpers

### `packages/skills` — Bundled workflow definitions
Markdown files with YAML frontmatter (`SKILL.md`) for chart-generator, financial-report, etc. At server startup, these are symlinked into `~/.pi/agent/skills/` so Pi's `DefaultResourceLoader` discovers them natively. Additional skills can be installed from remote repos via `npm run install-skill`.

## Key Patterns

- **Pi mock mode**: Server auto-falls back to mock when Pi SDK (`@mariozechner/pi-coding-agent`) isn't installed. No Azure credentials needed for UI development.
- **Native Pi skills**: Skills are invoked via Pi's `/skill:<name>` command syntax. The skill manager (`skill-manager.ts`) symlinks bundled skills from `packages/skills/` into `~/.pi/agent/skills/` at startup so Pi's `DefaultResourceLoader` discovers them natively (progressive disclosure, supporting files accessible via relative paths). The in-memory skill map is kept for the `/api/skills` REST endpoint (frontend slash command popup). Pi also auto-discovers per-workspace skills from `{workspace}/.pi/skills/`.
- **WebSocket event protocol**: JSON messages with `type` discriminator (`message_delta`, `tool_start`, `agent_end`, `files_changed`). Events flow: Pi SDK → `translatePiEvent()` → WebSocket → Zustand store → React.
- **Per-session workspaces**: Files isolated at `{DATA_ROOT}/workspaces/{sessionId}/workspace`. All file operations go through `safePath()` to prevent path traversal.
- **Session rebinding**: Pi sessions persist in-memory across WebSocket reconnects via `rebindSocket()`.
- **Docker sandbox**: When `SANDBOX_ENABLED=true`, each user gets an isolated Docker container. All four Pi tools — **bash, read, write, and edit** — are routed into the container. Bash runs via `docker exec` (`createSandboxBashOps`), file tools use `createSandboxFileOps` which executes through the container filesystem. The workspaces directory is bind-mounted (`-v {DATA_ROOT}/workspaces:/workspaces`) so the host can still serve file downloads/uploads. The sandbox manager (`sandbox-manager.ts`) handles container lifecycle.
- **Docker sandbox — implementation details** (important for future changes):
  - `createSandboxBashOps(userId)` in `sandbox-manager.ts` returns a Pi SDK `BashOperations` object that routes commands through `docker exec` with host→container path translation.
  - `createSandboxFileOps()` returns `{ read, edit, write }` operation objects that route file I/O through the container.
  - **Pi SDK limitation**: `createAgentSession()` does NOT forward `options.tools` to the internal `AgentSession` for execution. It only uses `options.tools` to derive active tool **names**. The actual tool implementations come from `AgentSession._baseToolsOverride` (if set) or `createAllTools()` (default). Since `createAgentSession` doesn't expose `baseToolsOverride`, we **patch the session after creation** in `pi-session.ts`:
    1. Call `createAgentSession()` normally (default tools)
    2. Set `session._baseToolsOverride` to a record containing all four tools with sandbox operations: `createReadTool(cwd, { operations: fileOps.read })`, `createBashTool(cwd, { operations: sandboxBashOps })`, `createEditTool(cwd, { operations: fileOps.edit })`, `createWriteTool(cwd, { operations: fileOps.write })`
    3. Call `session._buildRuntime()` to rebuild the tool registry from the override
  - These fields (`_baseToolsOverride`, `_buildRuntime`) are conventional-private (underscore prefix, not JS `#private`), so they're accessible at runtime but not in the TypeScript types — we cast via `as any`.
  - If the Pi SDK adds a public `baseToolsOverride` option to `createAgentSession` in the future, this patch can be replaced with a direct option pass.
- **MCP client**: Browork acts as an MCP client that connects to remote MCP servers. The system has three layers:
  - `mcp-manager.ts` — CRUD for server configs in SQLite (name, URL, transport, headers, enabled)
  - `mcp-client.ts` — Singleton `McpClientManager` that connects to remote servers via SSE or Streamable HTTP (`@modelcontextprotocol/sdk`), discovers tools via `client.listTools()`, and proxies `callTool()` requests. Auto-reconnects on 30s backoff.
  - `mcp-bridge.ts` — Converts MCP tools into Pi SDK `ToolDefinitionLike` format (same interface as `web-tools.ts`). Tool names are namespaced as `mcp__{serverName}__{toolName}` to avoid conflicts.
  - At session creation, `pi-session.ts` merges MCP tools into the `customTools` array alongside web tools.
  - MCP servers are global (shared across all users). Config stored in `mcp_servers` table (columns: `name`, `url`, `transport`, `headers`, `enabled`).
  - Routes (`/api/mcp/servers`) include live connection `status`, `toolCount`, and `error` from the client manager. Additional endpoints: `GET /api/mcp/servers/:name/tools`, `POST /api/mcp/servers/:name/reconnect`.
  - Test MCP server: `npx tsx scripts/test-mcp-server.ts` (port 3099, SSE, tools: `random_number`, `factorial`).

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22+, ESM throughout |
| Language | TypeScript 5.7 strict |
| Backend | Fastify 5, better-sqlite3, @fastify/websocket, adm-zip, @modelcontextprotocol/sdk |
| Frontend | React 19, Vite 6, Tailwind CSS 4, Zustand 5 |
| File tree | react-arborist 3 |
| Code editing | CodeMirror 6, AG Grid 33 |
| Testing | Vitest 3 (server only, no frontend tests) |
| Deploy | Docker, nginx reverse proxy, systemd |

## Environment

Copy `.env.example` to `.env`. The server runs in mock mode by default. Set `PI_PROVIDER`, `PI_MODEL`, and Azure credentials for real Pi agent integration. Set `VITE_APP_NAME` to customize the user-facing app name.
