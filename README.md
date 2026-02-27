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
│   │       ├── routes/sessions.ts    # Session CRUD
│   │       ├── routes/files.ts       # File management API
│   │       ├── routes/skills.ts      # Skills CRUD + invoke
│   │       ├── services/pi-session.ts # Pi SDK wrapper + mock mode
│   │       ├── services/mcp-manager.ts # MCP server config CRUD (SQLite)
│   │       ├── services/mcp-client.ts  # MCP client connections (SSE/HTTP)
│   │       ├── services/sandbox-manager.ts # Docker container-per-user isolation
│   │       ├── services/skill-manager.ts # Skill discovery, loading, invocation
│   │       ├── services/file-watcher.ts # Chokidar file watching
│   │       ├── tools/web-tools.ts    # Web search & fetch tools (Brave API)
│   │       ├── tools/mcp-bridge.ts   # MCP→Pi tool format bridge
│   │       ├── db/database.ts        # SQLite init (better-sqlite3, WAL mode)
│   │       ├── db/session-store.ts   # Session & message CRUD
│   │       ├── utils/                # Testable utilities (CSV, safePath, events)
│   │       ├── __tests__/            # Vitest tests
│   │       └── ws/session-stream.ts  # WebSocket handler
│   ├── skills/          # Bundled workflow skills
│   │   ├── chart-generator/SKILL.md
│   │   └── financial-report/SKILL.md
│   └── web/             # React frontend (Vite + Tailwind)
│       └── src/
│           ├── App.tsx               # Root component + WebSocket wiring
│           ├── api/client.ts         # REST + WebSocket URL helpers
│           ├── components/chat/      # ChatPanel, Composer, MessageBubble, InlineImageGroup, SkillBadge
│           ├── components/files/     # FilePanel, FileTree, editors, viewers
│           ├── components/layout/    # AppLayout, SessionSidebar
│           ├── hooks/useWebSocket.ts # WebSocket with reconnection
│           └── stores/               # Zustand stores (session, files, skills)
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

Images are persisted in the database alongside their associated assistant message, so they restore in the correct position when you return to a session later.

### Context usage and compaction

A progress bar above the composer shows how much of the model's context window is in use. When context gets large, use the `/compact` command (type it in the composer) to compress the conversation and free up space.

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

Runs Vitest server-side tests (179 tests): file routes, CSV parser, path traversal, Pi event translation, skill manager, session store, sandbox manager, MCP manager.

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
| `BRAVE_API_KEY` | — | Brave Search API key (enables `web_search` and `web_fetch` tools) |
| `VITE_APP_NAME` | `#opentowork` | User-facing app name |
