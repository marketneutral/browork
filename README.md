# Browork

A web-based UI for non-technical financial analysts to operate the Pi coding agent.

## Prerequisites

- **Node.js** 22+ (LTS)
- **npm** 10+

## Quick Start

```bash
# Install dependencies
npm install

# Start both server and frontend
npm run dev
```

This runs:
- **Backend** on `http://localhost:3001` (Fastify + WebSocket)
- **Frontend** on `http://localhost:5173` (Vite dev server, proxies `/api` to backend)

Open `http://localhost:5173` in your browser.

### Running individually

```bash
# Terminal 1 — backend
npm run dev:server

# Terminal 2 — frontend
npm run dev:web
```

## Pi Agent Integration

By default the server runs in **mock mode** — it streams simulated responses so you can develop the UI without the Pi SDK installed.

To connect a real Pi agent, install the SDK and set environment variables:

```bash
# .env (in project root)
PI_PROVIDER=azure-openai-responses
PI_MODEL=gpt-4
AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_RESOURCE_NAME=<your-resource>
DEFAULT_THINKING_LEVEL=medium
```

## Docker Sandbox

When `SANDBOX_ENABLED=true`, each user gets an isolated Docker container. All four Pi tools — **bash, read, write, and edit** — are routed into the container. Bash commands run via `docker exec` (`createSandboxBashOps`), and file operations use `createSandboxFileOps` which executes reads/writes/edits through the container filesystem. The workspaces directory is bind-mounted (`-v {DATA_ROOT}/workspaces:/workspaces`) so the host can still serve file downloads and uploads.

The sandbox image comes pre-installed with Python data-analysis packages (pandas, numpy, scipy, matplotlib, seaborn, openpyxl, yfinance, fredapi), PDF tools (poppler, tesseract, pypdf, pdfplumber, reportlab), office conversion (LibreOffice headless, pandoc), and Node.js packages (pptxgenjs, docx, pdf-lib). See `Dockerfile.sandbox` for the full list.

```bash
# Build the sandbox image
docker build -f packages/server/Dockerfile.sandbox -t opentowork-sandbox:latest .

# Enable in .env
SANDBOX_ENABLED=true
```

Containers are provisioned on first session creation and reused across sessions for the same user. Resource limits (`SANDBOX_MEMORY`, `SANDBOX_CPUS`) and network isolation (`SANDBOX_NETWORK`) are configurable via environment variables.

## Project Structure

```
browork/
├── packages/
│   ├── server/          # Fastify backend (REST + WebSocket)
│   │   └── src/
│   │       ├── index.ts              # Entry point
│   │       ├── routes/health.ts      # GET /health
│   │       ├── routes/auth.ts        # Login, register, me (includes isAdmin)
│   │       ├── routes/sessions.ts    # Session CRUD
│   │       ├── routes/files.ts       # File management API
│   │       ├── routes/skills.ts      # Skills CRUD + invoke
│   │       ├── routes/settings.ts    # Per-user & system-wide AGENTS.md settings
│   │       ├── services/pi-session.ts # Pi SDK wrapper + mock mode
│   │       ├── services/mcp-manager.ts # MCP server config CRUD (SQLite)
│   │       ├── services/mcp-client.ts  # MCP client connections (SSE/HTTP)
│   │       ├── services/sandbox-manager.ts # Docker container-per-user isolation
│   │       ├── services/skill-manager.ts # Skill discovery, loading, promote/demote
│   │       ├── services/agents-md-tracker.ts # Live AGENTS.md change injection
│   │       ├── services/file-watcher.ts # Chokidar file watching
│   │       ├── tools/web-tools.ts    # Web search & fetch tools (Brave API)
│   │       ├── tools/ask-user.ts     # Interactive ask_user tool for mid-execution input
│   │       ├── tools/mcp-bridge.ts   # MCP→Pi tool format bridge
│   │       ├── utils/image-inject.ts # Injects Pi-created images back into tool results
│   │       ├── db/database.ts        # SQLite init (better-sqlite3, WAL mode)
│   │       ├── db/session-store.ts   # Session & message CRUD
│   │       ├── utils/                # Testable utilities (CSV, safePath, events)
│   │       ├── __tests__/            # Vitest tests
│   │       └── ws/session-stream.ts  # WebSocket handler
│   ├── skills/          # Placeholder package (bundled skills removed)
│   └── web/             # React frontend (Vite + Tailwind)
│       └── src/
│           ├── App.tsx               # Root component + WebSocket wiring
│           ├── api/client.ts         # REST + WebSocket URL helpers
│           ├── components/chat/      # ChatPanel, Composer, MessageBubble, AskUserCard, InlineImageGroup
│           ├── components/files/     # FilePanel, FileTree, editors, viewers
│           ├── components/layout/    # AppLayout, SessionSidebar, StatusPanel, SettingsDialog
│           ├── hooks/useWebSocket.ts # WebSocket with reconnection
│           └── stores/               # Zustand stores (session, files, skills, auth)
├── docs/
│   └── skills-guide.md  # User-facing skills documentation
├── package.json         # Workspace root
└── tsconfig.base.json   # Shared TypeScript config
```

## MCP Servers

Browork can connect to remote [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) servers to give the AI agent access to external tools — databases, APIs, custom workflows, etc.

### Adding a server

Open **Settings > MCP Servers** in the UI, or use the REST API:

```bash
curl -X POST http://localhost:3001/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{"name": "my-tools", "url": "http://localhost:3099/sse"}'
```

Browork connects in the background, discovers available tools via `listTools()`, and injects them into all subsequent Pi sessions. Tools appear namespaced as `mcp__<server>__<tool>` to avoid conflicts.

Supported transports: **SSE** (default) and **Streamable HTTP**. Custom headers (e.g. `Authorization`) can be added per server.

### Test MCP server

A bundled test server is included for verifying connectivity:

```bash
npx tsx scripts/test-mcp-server.ts
```

This starts an SSE server on port 3099 with two tools:
- `random_number(n)` — generate N random numbers as CSV
- `factorial(x)` — compute factorial (memoized)

Then add it in settings: Name=`test-tools`, URL=`http://localhost:3099/sse`, Transport=SSE.

## Chat Features

### Inline image previews

When the Pi agent creates image files during a conversation (e.g. matplotlib charts, generated plots), they appear as clickable thumbnails inline in the chat — no need to switch to the file panel. Supported formats: PNG, JPG, JPEG, GIF, SVG, WebP.

Images are persisted in the database alongside their associated assistant message, so they restore in the correct position when you return to a session later. Pi also receives its own generated images back as visual context in tool results, so it can see and iterate on charts and plots it creates.

### @ file mentions

Type `@` in the composer to browse and reference workspace files inline. A popup appears with keyboard navigation (arrow keys, Enter, Escape) and directory drill-down — selecting a directory expands its contents rather than inserting it. Selected files are inserted as `@path/to/file` references in your message.

### Interactive prompts (ask_user)

Pi can pause mid-execution to ask you questions via a multi-choice card in the chat. Options support single-select, multi-select, and free-text "Other" input. The agent blocks until you respond (5-minute timeout), then continues with your answer.

### Thinking transparency

When Pi uses extended thinking (configurable via `DEFAULT_THINKING_LEVEL`), a live snippet of its reasoning is shown in the status area below the chat. This lets you see what Pi is considering as it works.

### Context usage and compaction

A progress bar in the right-panel footer shows how much of the model's context window is in use. When context gets large, use the `/compact` command (type it in the composer) to compress the conversation and free up space. During compaction, the status bar shows "Compacting context..." and the input is disabled until complete.

### Live project instructions (AGENTS.md)

If you create or edit an `AGENTS.md` file in your workspace, the updated instructions are automatically injected into the next prompt to the Pi agent — no session restart needed. This lets you iteratively refine project-level guidance (coding standards, output formats, domain rules) while the agent is running.

### Per-user AGENTS.md settings

Open **Settings** (gear icon) to customize the default AGENTS.md content written into every new session. Each user can maintain their own version. Admin users (see below) can also save a system-wide default that applies to all users who haven't set a personal override.

## User Skills (Promote / Demote)

Skills created by the Pi agent during a session start as **session-local** — scoped to that one session, stored in `{workspace}/.pi/skills/`. You can promote them to your personal library so they're available in all future sessions.

In the **StatusPanel** (bottom-right footer), skills are organized into three groups:

| Group | Scope | Actions |
|-------|-------|---------|
| **Built-in** | All users, all sessions | None (admin-managed) |
| **My Skills** | Current user, all sessions | Demote (↓), Delete (×) |
| **Session** | Current session only | Promote (↑) |

- **Promote** copies the skill to your personal library (`{DATA_ROOT}/user-skills/{userId}/`) and replaces the session copy with a symlink. The skill disappears from "Session" and appears in "My Skills".
- **Demote** moves a skill from your library back into the current session as a real directory so you can edit it. It disappears from "My Skills" and appears in "Session".
- **Delete** permanently removes a skill from your library.

User skills are per-user — they are not visible to other users in a multi-user deployment. At session creation, symlinks are created in the workspace so Pi can discover them, but these symlinks are hidden from the file panel.

## Installing Skills

Install individual skills from any remote repo that contains `<skill-name>/SKILL.md` directories:

```bash
npm run install-skill -- <repo-url> <skill-name>
```

For example, to install the `skill-creator` skill from Anthropic's skills repo:

```bash
npm run install-skill -- https://github.com/anthropics/skills skill-creator
```

This shallow-clones the repo, locates the skill directory (checking both `<name>/SKILL.md` and `skills/<name>/SKILL.md`), copies it to `~/.pi/agent/skills/<name>/`, and cleans up.

To overwrite an already-installed skill, pass `--force`:

```bash
npm run install-skill -- https://github.com/anthropics/skills skill-creator --force
```

## Tests

```bash
npm test
```

Runs Vitest server-side tests (~213 tests): file routes, CSV parser, path traversal, Pi event translation, skill manager, user skills (promote/demote), session store, sandbox manager, MCP manager.

## Build

```bash
npm run build
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `DATA_ROOT` | `./data` | Root directory for user workspaces |
| `MAX_UPLOAD_SIZE_MB` | `10` | Max file upload size |
| `PI_PROVIDER` | `azure-openai-responses` | LLM provider for Pi |
| `PI_MODEL` | `gpt-4` | Model ID |
| `DEFAULT_THINKING_LEVEL` | `medium` | Default thinking depth (`low` / `medium` / `high`) |
| `SANDBOX_ENABLED` | `false` | Enable Docker container isolation per user |
| `SANDBOX_IMAGE` | `opentowork-sandbox:latest` | Docker image for sandbox containers |
| `SANDBOX_MEMORY` | `512m` | Memory limit per sandbox container |
| `SANDBOX_CPUS` | `1.0` | CPU limit per sandbox container |
| `SANDBOX_NETWORK` | `bridge` | Docker network for sandbox containers (`none` to fully isolate) |
| `ADMIN_USERNAMES` | — | Comma-separated list of admin usernames (can save system-wide AGENTS.md default) |
| `BRAVE_API_KEY` | — | Brave Search API key (enables `web_search` and `web_fetch` tools) |
| `VITE_APP_NAME` | `#opentowork` | User-facing app name |
