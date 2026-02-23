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

When `SANDBOX_ENABLED=true`, each user gets an isolated Docker container. Currently **only Pi's bash tool** is routed into the container via `createSandboxBashOps()`. Pi's **read, write, and edit tools still execute on the host** — this works because the workspaces directory is bind-mounted into the container (`-v {DATA_ROOT}/workspaces:/workspaces`), so file changes are visible from both sides immediately.

> **Note:** If you need full isolation (read/write/edit inside the container too), add custom tool implementations to the `_baseToolsOverride` record in `pi-session.ts`. See the CLAUDE.md "Docker sandbox — implementation details" section for how the Pi SDK session patching works — it's non-obvious and important to understand before changing.

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
│   │       ├── services/sandbox-manager.ts # Docker container-per-user isolation
│   │       ├── services/skill-manager.ts # Skill discovery, loading, invocation
│   │       ├── services/file-watcher.ts # Chokidar file watching
│   │       ├── db/database.ts        # SQLite init (better-sqlite3, WAL mode)
│   │       ├── db/session-store.ts   # Session & message CRUD
│   │       ├── utils/                # Testable utilities (CSV, safePath, events)
│   │       ├── __tests__/            # Vitest tests (85 tests)
│   │       └── ws/session-stream.ts  # WebSocket handler
│   ├── skills/          # Bundled workflow skills
│   │   ├── chart-generator/SKILL.md
│   │   └── financial-report/SKILL.md
│   └── web/             # React frontend (Vite + Tailwind)
│       └── src/
│           ├── App.tsx               # Root component + WebSocket wiring
│           ├── api/client.ts         # REST + WebSocket URL helpers
│           ├── components/chat/      # ChatPanel, Composer, MessageBubble, SkillsBar, SkillBadge
│           ├── components/files/     # FilePanel, FileTree, editors, viewers
│           ├── components/layout/    # AppLayout, SessionSidebar
│           ├── hooks/useWebSocket.ts # WebSocket with reconnection
│           └── stores/               # Zustand stores (session, files, skills)
├── package.json         # Workspace root
└── tsconfig.base.json   # Shared TypeScript config
```

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

Runs Vitest server-side tests (173 tests): file routes, CSV parser, path traversal, Pi event translation, skill manager, session store, sandbox manager.

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
| `SANDBOX_NETWORK` | `none` | Docker network for sandbox containers |
