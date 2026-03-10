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
npm run dev:admin        # Admin dashboard only (Vite dev server, :5174, proxies /api to :3001)
npm test                 # Run server-side Vitest tests (~217 tests)
npm run build            # Build server (tsc) then web (tsc + vite build)
npm run lint             # ESLint across all packages
npm run install-skill -- <repo-url> <skill-name>  # Install a single skill from a remote repo
```

Single test file: `npx vitest run packages/server/src/__tests__/safe-path.test.ts`
Watch mode: `npm run test:watch --workspace=packages/server`

## Architecture

**Monorepo** (`npm workspaces`) with four packages under `packages/`:

### `packages/server` — Fastify 5 backend
- **Entry**: `src/index.ts`
- **Routes** (`src/routes/`): REST endpoints for auth, sessions, files, skills, settings, health, MCP
- **Services** (`src/services/`): Pi SDK wrapper (with mock fallback), skill manager, file watcher (chokidar), MCP client manager, sandbox manager
- **Tools** (`src/tools/`): Custom Pi tools — web search/fetch (`web-tools.ts`), interactive ask_user (`ask-user.ts`), MCP bridge (`mcp-bridge.ts`), subagent delegation (`subagent.ts`)
- **WebSocket** (`src/ws/session-stream.ts`): Streams Pi agent events to the client in real-time
- **Database** (`src/db/`): SQLite via better-sqlite3 (WAL mode), no ORM — direct prepared statements. Tables: users, tokens, sessions, messages (with `images` and `tool_calls` columns for inline image and tool call persistence), mcp_servers
- **Auth** (`src/plugins/auth.ts`): Bearer token validation as a Fastify plugin; scrypt password hashing
- **Zip handling**: Uploaded `.zip` files are auto-extracted server-side (adm-zip). Download-all-as-zip endpoint for workspace export.
- **Tests** (`src/__tests__/`): Vitest with temp directory + test DB per suite

### `packages/web` — React 19 SPA
- **Build**: Vite 6 with `@` path alias → `./src/`
- **Styling**: Tailwind CSS 4 (v4 `@theme` tokens, `@tailwindcss/vite` plugin). Base font: Plus Jakarta Sans at 17px. No serif fonts.
- **State**: Zustand stores in `src/stores/` — session (messages, streaming), files, skills, auth (localStorage-backed)
- **Layout**: 3-panel (`src/components/layout/AppLayout.tsx`) — collapsible sidebar, chat panel, resizable file panel. `SettingsDialog.tsx` for per-user AGENTS.md configuration.
- **File tree**: react-arborist with drag-and-drop move, inline rename, per-file download, and colored Lucide file-type icons (`FileIcon` component in `FileTree.tsx`)
- **Editors**: CodeMirror (code), AG Grid (CSV), Markdown editor (`@uiw/react-md-editor`) in `src/components/files/editors/`
- **Viewers**: Image, PDF, and HTML (sandboxed iframe with source toggle) in `src/components/files/viewers/`
- **Chat**: Message bubbles + rich tool call cards (`ToolCallCard.tsx`) with terminal-style bash output, color-coded diffs for edits, and expandable result details. Inline image previews (`InlineImageGroup.tsx`) for Pi-generated images. Interactive `AskUserCard.tsx` for mid-execution user prompts. `SubagentCard.tsx` for nested sub-agent activity with capability pills, streaming text, and nested tool calls. `@` file mention popup in Composer for inline file references with directory drill-down. Image paste/drop in Composer for attaching user images.
- **Context bar**: Progress bar showing context window usage; `/compact` command to compress context
- **Thinking transparency**: Live display of Pi's extended reasoning in the status area (from `thinking_delta` WebSocket events)
- **App config**: `src/config.ts` exports `APP_NAME` from `VITE_APP_NAME` env var
- **WebSocket hook**: `src/hooks/useWebSocket.ts` with automatic reconnection and backoff
- **API client**: `src/api/client.ts` — centralized REST + WebSocket URL helpers

### `packages/admin` — Admin dashboard SPA
- **Build**: Vite 6 on port 5174 with `@` path alias, proxies `/api` to `:3001`
- **Styling**: Tailwind CSS 4 (same dark theme as web), glass morphism UI, Recharts charts
- **State**: Zustand stores for auth (token/user in localStorage) and admin data
- **Auth**: Token-based with `isAdmin` role check via `AdminAuthGate.tsx`
- **Pages**:
  - **Dashboard**: Overview stats (users, sessions, messages, storage) + activity charts
  - **Users**: Searchable/sortable user list, user detail with sessions table, **delete user** (with cascade confirmation showing session/message/storage impact). Cannot delete self.
  - **Activity**: Time-series analytics (7d/30d/90d) for sessions, messages, DAU, signups
  - **Tools**: Pi tool usage bar chart + error rates table
  - **MCP Servers**: Full CRUD — add new servers (name, URL, transport), view status badges (connected/connecting/disconnected/error), tool count, enable/disable toggle, reconnect button, expandable tool list, delete with confirmation. MCP server management is **admin-only**.
  - **Skills**: System skills table (name, description, directory, delete button) + per-user installed skills grouped by user
  - **Sessions**: Live active sessions monitor with auto-refresh (5s). Shows user, session name, status (Running/Idle/Disconnected), tool calls in progress, buffer length, connection state.
  - **System**: CPU, memory, disk, database, Docker container stats, sandbox status
  - **Settings**: System-wide default AGENTS.md editor, Pi prompt inspection (SYSTEM.md, APPEND_SYSTEM.md, assembled prompt)
- **Routes**: `/admin` (dashboard), `/admin/users`, `/admin/users/:id`, `/admin/activity`, `/admin/tools`, `/admin/mcp`, `/admin/skills`, `/admin/sessions`, `/admin/system`, `/admin/settings`

### `packages/skills` — Skill package placeholder
Previously bundled workflow definitions (chart-generator, financial-report) which have been removed. Skills are now installed from remote repos via `npm run install-skill` into `~/.pi/agent/skills/`, or created by Pi during sessions in `{workspace}/.pi/skills/`, or promoted to per-user storage at `{DATA_ROOT}/user-skills/{userId}/`.

## Key Patterns

- **Pi mock mode**: Server auto-falls back to mock when Pi SDK (`@mariozechner/pi-coding-agent`) isn't installed. No Azure credentials needed for UI development.
- **Native Pi skills**: Skills are invoked via Pi's `/skill:<name>` command syntax. The skill manager (`skill-manager.ts`) symlinks bundled skills from `packages/skills/` into `~/.pi/agent/skills/` at startup so Pi's `DefaultResourceLoader` discovers them natively (progressive disclosure, supporting files accessible via relative paths). The in-memory skill map is kept for the `/api/skills` REST endpoint (frontend slash command popup). Pi also auto-discovers per-workspace skills from `{workspace}/.pi/skills/`.
- **Skill path resolution** (`APPEND_SYSTEM.md` generation): At startup, `initSkills()` writes `~/.pi/agent/APPEND_SYSTEM.md` with two sections: (1) a table mapping each skill name to its absolute base directory so Pi resolves relative paths in SKILL.md files (e.g. `scripts/thumbnail.py` → `/Users/.../skills/pptx/scripts/thumbnail.py`), and (2) a list of pre-installed packages (Python, Node.js, system tools) so Pi doesn't waste time reinstalling them. This file is auto-appended to every Pi session's system prompt by the SDK.
- **Broken symlink cleanup**: `initSkills()` removes broken symlinks from `~/.pi/agent/skills/` (e.g. from previously bundled skills that were deleted).
- **Three-tier skill system**: Skills exist at three levels, each with different scope:
  1. **Built-in (admin)** — bundled in `packages/skills/`, symlinked to `~/.pi/agent/skills/` at startup, available to all users and sessions.
  2. **User-installed ("My Skills")** — stored in `{DATA_ROOT}/user-skills/{userId}/{skillName}/`, persist across sessions for a single user. Symlinked into each workspace's `.pi/skills/` at session creation (`symlinkUserSkillsToWorkspace` in `pi-session.ts`) so Pi discovers them. These symlinks are hidden from the file listing API (`listTree` in `files.ts` uses `lstat` to detect and skip symlinks inside `.pi/skills/`).
  3. **Session-local** — real directories in `{workspace}/.pi/skills/{name}/`, scoped to one session. Created by Pi during agent execution or via demote.
- **Skill promote/demote** (`skill-manager.ts`):
  - **Promote** (`POST /skills/user/promote`): Copies a session-local skill to `{DATA_ROOT}/user-skills/{userId}/`, then replaces the session copy with a symlink to the user copy. This ensures `listSessionSkills` (which uses `Dirent.isDirectory()` — returns `false` for symlinks) no longer returns it, while Pi can still discover it via the symlink. Re-promoting an already-promoted skill (session path is already a symlink to user dir) is a no-op.
  - **Demote** (`POST /skills/user/demote`): Copies the user skill into `{workspace}/.pi/skills/` as a real directory (removing any existing symlink or directory via `lstat` + `rm`), then deletes the user copy. The skill moves from "My Skills" to "Session" for editing.
  - **Delete** (`DELETE /skills/user/:name`): Removes the user skill from disk entirely.
  - Frontend: `StatusPanel.tsx` shows all three tiers with promote (↑), demote (↓), and delete (×) buttons. A `busy` state prevents double-clicks during async operations. The expanded section has `max-h-[40vh] overflow-y-auto` to avoid squeezing the file panel.
- **WebSocket event protocol**: JSON messages with `type` discriminator (`message_delta`, `tool_start`, `agent_end`, `files_changed`). Events flow: Pi SDK → `translatePiEvent()` → WebSocket → Zustand store → React.
- **Per-session workspaces**: Files isolated at `{DATA_ROOT}/workspaces/{sessionId}/workspace`. All file operations go through `safePath()` to prevent path traversal.
- **Session rebinding**: Pi sessions persist in-memory across WebSocket reconnects via `rebindSocket()`. Turn-scoped buffers (`assistantBuffer`, `turnImagePaths`, `turnToolCalls`) live on the `PiSessionHandle.turnState` object (not in the WebSocket handler closure) so they survive disconnects. Accumulation and DB persistence happen in the Pi `session.subscribe()` callback in `pi-session.ts` (which fires unconditionally, even when no socket is connected). On rebind, `rebindSocket()` replays all accumulated tool calls and assistant text to the new socket so the client catches up on anything it missed.
- **Inline image previews**: When Pi creates image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`) during a turn, they appear as clickable thumbnails inline in the chat timeline. The flow:
  - Server-side: `files_changed` WebSocket events (from the file watcher) are intercepted in `session-stream.ts` to accumulate image paths into `session.turnState.turnImagePaths`. On `agent_end`, the subscribe callback in `pi-session.ts` persists them in the `images` TEXT column of the messages table (JSON array).
  - Client-side: during live streaming, `files_changed` events trigger `addPendingImages()` in the session store; `agent_end` finalizes them into the timeline as `TurnImages` groups. On session reload, image groups are restored from the `images` field on messages with `seq = messageSeq + 0.5` so they sort in the correct position.
  - Component: `InlineImageGroup.tsx` renders thumbnails via auth-fetched blob URLs. Clicking an image downloads it.
- **Tool call persistence**: Tool calls (bash output, file reads/edits, etc.) are persisted in the `tool_calls` TEXT column of the messages table, following the same pattern as inline images. The flow:
  - Server-side (`pi-session.ts`): the `session.subscribe()` callback accumulates tool call records (`{ tool, args, result, isError }`) into `turnState.turnToolCalls` as Pi events fire. Results are truncated at 4000 chars. On `agent_end`, the buffer is serialized to JSON and attached to the assistant message via `addMessage()` or `setLastMessageToolCalls()`. Because accumulation happens in the subscribe callback (not a WebSocket send interceptor), tool calls are captured even when the user is disconnected (e.g. viewing a different session).
  - Client-side: on session reload, `tool_calls` JSON is parsed and restored as completed `ToolCallGroup` entries at `seq = messageSeq - 0.5` (before the assistant message, complementing images at `+0.5`). The `addRestoredToolGroup()` action in the session store creates groups with all tools set to `status: "done"`.
  - Fork: `forkSession()` copies `tool_calls` alongside `images` when duplicating messages.
- **Docker sandbox**: When `SANDBOX_ENABLED=true`, each user gets an isolated Docker container. All four Pi tools — **bash, read, write, and edit** — are routed into the container. Bash runs via `docker exec` (`createSandboxBashOps`), file tools use `createSandboxFileOps` which executes through the container filesystem. The workspaces directory is bind-mounted (`-v {DATA_ROOT}/workspaces:/workspaces`) so the host can still serve file downloads/uploads. The sandbox manager (`sandbox-manager.ts`) handles container lifecycle. Pre-installed Python packages: pandas, numpy, scipy, matplotlib, seaborn, openpyxl, xlsxwriter, yfinance, fredapi, pandas-datareader, pypdf, pdfplumber, reportlab, Pillow, and more (see `Dockerfile.sandbox`).
- **Docker sandbox — implementation details** (important for future changes):
  - `createSandboxBashOps(userId)` in `sandbox-manager.ts` returns a Pi SDK `BashOperations` object that routes commands through `docker exec` with host→container path translation.
  - `createSandboxFileOps()` returns `{ read, edit, write }` operation objects that route file I/O through the container.
  - **Pi SDK limitation**: `createAgentSession()` does NOT forward `options.tools` to the internal `AgentSession` for execution. It only uses `options.tools` to derive active tool **names**. The actual tool implementations come from `AgentSession._baseToolsOverride` (if set) or `createAllTools()` (default). Since `createAgentSession` doesn't expose `baseToolsOverride`, we **patch the session after creation** in `pi-session.ts`:
    1. Call `createAgentSession()` normally (default tools)
    2. Set `session._baseToolsOverride` to a record containing all four tools with sandbox operations: `createReadTool(cwd, { operations: fileOps.read })`, `createBashTool(cwd, { operations: sandboxBashOps })`, `createEditTool(cwd, { operations: fileOps.edit })`, `createWriteTool(cwd, { operations: fileOps.write })`
    3. Call `session._buildRuntime()` to rebuild the tool registry from the override
  - These fields (`_baseToolsOverride`, `_buildRuntime`) are conventional-private (underscore prefix, not JS `#private`), so they're accessible at runtime but not in the TypeScript types — we cast via `as any`.
  - If the Pi SDK adds a public `baseToolsOverride` option to `createAgentSession` in the future, this patch can be replaced with a direct option pass.
- **AGENTS.md live injection** (`agents-md-tracker.ts`): When the user (or Pi) edits `AGENTS.md` in a workspace, the tracker detects the change via the file watcher, hashes the content, and marks it dirty. On the next `sendPrompt()`, the updated content is prepended to the user message wrapped in `<updated-project-instructions>` XML tags. The dirty flag is cleared after injection so it's only sent once. This means Pi picks up new project instructions mid-session without a restart.
- **`/compact` UI feedback**: The session store has an `isCompacting` boolean. Set to `true` when the user sends `/compact`, cleared automatically when the next `context_usage` event arrives (compact always emits one). ChatPanel shows a pulsing "Compacting context..." indicator and the composer is disabled during compaction. The context bar in `AppLayout.tsx` stays visible whenever `percent != null` (not just `> 0`) so it doesn't vanish after compact reduces context.
- **MCP client**: Browork acts as an MCP client that connects to remote MCP servers. The system has three layers:
  - `mcp-manager.ts` — CRUD for server configs in SQLite (name, URL, transport, headers, enabled)
  - `mcp-client.ts` — Singleton `McpClientManager` that connects to remote servers via SSE or Streamable HTTP (`@modelcontextprotocol/sdk`), discovers tools via `client.listTools()`, and proxies `callTool()` requests. Auto-reconnects on 30s backoff.
  - `mcp-bridge.ts` — Converts MCP tools into Pi SDK `ToolDefinitionLike` format (same interface as `web-tools.ts`). Tool names are namespaced as `mcp__{serverName}__{toolName}` to avoid conflicts.
  - At session creation, `pi-session.ts` merges MCP tools into the `customTools` array alongside web tools.
  - MCP servers are global (shared across all users). Config stored in `mcp_servers` table (columns: `name`, `url`, `transport`, `headers`, `enabled`).
  - Routes (`/api/mcp/servers`) include live connection `status`, `toolCount`, and `error` from the client manager. Additional endpoints: `GET /api/mcp/servers/:name/tools`, `POST /api/mcp/servers/:name/reconnect`.
  - Test MCP server: `npx tsx scripts/test-mcp-server.ts` (port 3099, SSE, tools: `random_number`, `factorial`).
- **LDAP authentication** (`services/ldap-auth.ts`): When `AUTH_MODE=ldap`, login authenticates via LDAP simple bind instead of local scrypt password comparison. `LDAP_URL` and `LDAP_BIND_DN_TEMPLATE` (with `{}` placeholder for username) must be set. On first successful LDAP login, the user is auto-provisioned in the local SQLite DB with a random placeholder password. Registration is disabled in LDAP mode (403). The frontend fetches `GET /api/auth/config` on load to determine the auth mode and hides the registration link when in LDAP mode. Uses `ldapts` package.
- **Admin role** (`ADMIN_USERNAMES` env var): Comma-separated list of admin usernames. `isAdminUser()` in `auth.ts` checks membership (case-insensitive). All auth endpoints (`login`, `register`, `me`) include `isAdmin: boolean` in the user response. No DB schema change — admin is config-driven. Currently admins can save a system-wide default AGENTS.md via `PUT /settings/agents-md/default` (403 for non-admins). The frontend shows a "Save as Default" button in `SettingsDialog.tsx` for admin users.
- **Admin dashboard** (`packages/admin/`): Separate SPA at `/admin` with its own Vite config (port 5174). All admin API routes (`/api/admin/*`) are guarded by `adminGuard` (checks `isAdminUser()`). Key admin-only capabilities:
  - **MCP server CRUD**: Add, delete, enable/disable, reconnect MCP servers via `POST/DELETE/PATCH /api/admin/mcp/servers`. Read-only MCP status is also available to regular users via `/api/mcp/servers`.
  - **Skill removal**: `DELETE /api/admin/skills/:name` removes a system skill's symlink from `~/.pi/agent/skills/` and the in-memory map via `removeSystemSkill()`.
  - **Active sessions**: `GET /api/admin/sessions/active` returns live session state from the `activeSessionMeta` Map in `pi-session.ts` (userId, isRunning, hasSocket, toolCallsInProgress, bufferLength), joined with DB metadata.
  - **User deletion**: `DELETE /api/admin/users/:id` cascades through sessions, messages, tokens (DB `ON DELETE CASCADE`) and cleans up workspace dirs, user-skills, and user-settings on disk. Self-deletion is blocked.
- **Per-user AGENTS.md settings** (`settings.ts`):
  - Each user can customize the AGENTS.md written into new sessions via `PUT /settings/agents-md`. Stored at `{DATA_ROOT}/user-settings/{userId}/AGENTS.md`.
  - System-wide default stored at `{DATA_ROOT}/system-settings/AGENTS.md`, writable by admins. `readSystemDefault()` reads from disk, falls back to hardcoded `DEFAULT_AGENTS_MD`.
  - Session creation (`sessions.ts`) uses `readSystemDefault()` as the base, overridden by user-specific content if present.
  - Frontend: `SettingsDialog.tsx` (opened via gear icon) with textarea editor, "Revert to Default" button, and admin-only "Save as Default".
- **ask_user tool** (`tools/ask-user.ts`): A Pi SDK `ToolDefinitionLike` that pauses agent execution to present a multi-choice questionnaire to the user. The tool creates a deferred Promise and sends the question via WebSocket. The user responds through `AskUserCard.tsx` (multi-step card with single/multi-select, free-text "Other" input). Response is sent back via WebSocket `ask_user_response` event, resolving the Promise so Pi continues. 5-minute timeout.
- **Image injection** (`utils/image-inject.ts`): After Pi executes a bash command, `wrapBashWithImageInjection()` scans the workspace for newly created image files (PNG, JPG, GIF, WebP) and appends up to 3 as `ImageContent` objects to the bash tool result. This lets Pi see charts and plots it creates. The wrapped bash tool is injected into `_baseToolsOverride` in `pi-session.ts`.
- **Subagent delegation** (`tools/subagent.ts`): The parent Pi agent can spawn child agents via the `subagent` tool. Each child gets a fresh context window, an in-process `createAgentSession()` with `SessionManager.inMemory()`, and the same sandbox integration as the parent (via `_baseToolsOverride` patching). Key design:
  - **Default tools**: `read` and `bash` only. Parent can opt-in `write`, `edit`, `web_search`, `web_fetch` via the `tools` param.
  - **Skills**: Disabled by default via `skillsOverride` on the `DefaultResourceLoader` (returns empty skills array). Set `skills: true` to enable workspace skill discovery.
  - **MCP tools**: Not available by default. Parent specifies `mcp_servers: ["server-name"]` to grant access to specific MCP servers. Tools are bridged via `bridgeMcpTools()` same as the parent session.
  - **AGENTS.md**: Workspace-local AGENTS.md is inherited (filtered via `agentsFilesOverride` to exclude ancestor files).
  - **Events**: Five WebSocket event types (`subagent_start/tool_start/tool_end/message_delta/end`) with `subagentId` for multiplexing. The `subagent_start` event includes `activeTools` (resolved tool name list) for UI display.
  - **UI**: `SubagentCard.tsx` renders capability pills (icon + label per tool), scrollable task description, expandable nested tool calls (reuses `ToolCallCard` with `nested` prop), streaming text area, and final result. Live state is matched by name+task from the `subagentStates` Map in the session store; restored sessions fall back to `result.details`.
  - **Persistence**: `activeTools` and `toolCalls` are included in the tool result `details` object, so they survive session reload via the `tool_calls` persistence mechanism.
- **Running session indicators**: The sidebar shows a pulsing dot next to sessions where the Pi agent is actively running. Implementation:
  - Server-side: `GET /api/sessions/running` returns running session IDs for the current user (filtered from `listActiveSessions()`).
  - Client-side: `runningSessions` Set in the session store, polled every 3 seconds via `refreshRunningSessions()`. Also refreshed on `agent_start` and `agent_end` events.
  - UI: `SessionSidebar.tsx` renders a ping-animated dot instead of the MessageSquare icon for running sessions.
- **Tool call ordering on session switch**: A `historyLoaded` boolean in the session store prevents `activeToolCalls` and streaming text from rendering before the async session history load completes. `setMessages()` atomically sets `historyLoaded: true`; `setSessionId()` resets it to `false`. `ChatPanel.tsx` gates rendering on this flag.
- **Image paste/drop in Composer**: Users can paste images from clipboard or drag-and-drop image files into the chat composer. Images are converted to base64, shown as removable thumbnails in the composer, and sent alongside the prompt text via the `images` field on the WebSocket `prompt` command. User-attached images are persisted in the `images` column of the messages table (JSON array of `{ data, mimeType }`) and restored on session reload as `attachedImages` on user messages.
- **Mermaid diagram rendering**: Markdown preview in the file viewer renders mermaid code blocks as diagrams using the mermaid library. Fenced code blocks with language `mermaid` are detected and rendered inline.
- **Chrome PDF drag-drop prevention**: An inline `<script>` in `index.html` (before React loads) prevents Chrome from intercepting PDF file drops by calling `preventDefault()` on `dragover`, `drop`, and `dragenter` events at the window level. This ensures PDF files are handled by the file upload drop zone rather than opened in a new browser tab.
- **@ file mentions** (Composer): Typing `@` in the chat composer opens a popup showing workspace files with keyboard navigation and directory drill-down. Selecting a file inserts `@path/to/file` into the message; selecting a directory expands its contents. The file list is fetched from the files store.

## Pi System Prompt

The system prompt is built by the Pi SDK (`node_modules/@mariozechner/pi-coding-agent/dist/core/system-prompt.js`), not by this codebase. Understanding its structure is important for customization.

### Default base prompt (when no `SYSTEM.md` exists)
```
You are an expert coding assistant operating inside pi, a coding agent harness.
You help users by reading files, executing commands, editing code, and writing new files.

Available tools: [dynamically lists active tools with descriptions]

Guidelines: [conditional on which tools are active — prefer grep over bash, use read before edit, etc.]

Pi documentation: [paths to Pi's own docs, only read when user asks about Pi itself]
```

### Appended sections (in order)
1. **`APPEND_SYSTEM.md`** — from project or `~/.pi/agent/APPEND_SYSTEM.md`
2. **`# Project Context`** — all discovered `AGENTS.md` / `CLAUDE.md` files up the directory tree, each rendered as `## {filePath}\n\n{content}`
3. **Skills** (only if `read` tool is active) — XML block listing available skills:
   ```xml
   <available_skills>
     <skill><name>chart-generator</name><description>...</description><location>/path/to/SKILL.md</location></skill>
   </available_skills>
   ```
   Skills with `disableModelInvocation: true` are excluded (triggered only via `/skill:<name>`).
4. `Current date and time: {dateTime}`
5. `Current working directory: {cwd}`

### Customization hooks
- **Replace entire prompt**: Place a `SYSTEM.md` in the project root or `~/.pi/agent/SYSTEM.md`
- **Append to default prompt**: Use `APPEND_SYSTEM.md` files
- **Inject project context**: Place an `AGENTS.md` or `CLAUDE.md` in the workspace (auto-discovered)
- **Programmatic**: `DefaultResourceLoader` accepts `systemPromptOverride` and `appendSystemPromptOverride` callbacks

### Call chain
1. `DefaultResourceLoader.reload()` discovers `SYSTEM.md` → stored as `customPrompt`
2. `AgentSession._rebuildSystemPrompt(toolNames)` calls `buildSystemPrompt({ cwd, skills, contextFiles, customPrompt, ... })`
3. `_buildRuntime()` calls `_rebuildSystemPrompt()` and sets it via `agent.setSystemPrompt(...)`

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22+, ESM throughout |
| Language | TypeScript 5.7 strict |
| Backend | Fastify 5, better-sqlite3, @fastify/websocket, adm-zip, @modelcontextprotocol/sdk, ldapts |
| Frontend | React 19, Vite 6, Tailwind CSS 4, Zustand 5 |
| File tree | react-arborist 3 |
| Code editing | CodeMirror 6, AG Grid 33 |
| Testing | Vitest 3 (server only, no frontend tests) |
| Deploy | Docker, nginx reverse proxy, systemd |

## Environment

Copy `.env.example` to `.env`. The server runs in mock mode by default. Set `PI_PROVIDER`, `PI_MODEL`, and Azure credentials for real Pi agent integration. Set `VITE_APP_NAME` to customize the user-facing app name.
