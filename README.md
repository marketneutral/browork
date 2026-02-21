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

## Project Structure

```
browork/
├── packages/
│   ├── server/          # Fastify backend (REST + WebSocket)
│   │   └── src/
│   │       ├── index.ts              # Entry point
│   │       ├── routes/health.ts      # GET /health
│   │       ├── routes/sessions.ts    # Session CRUD
│   │       ├── services/pi-session.ts # Pi SDK wrapper + mock mode
│   │       └── ws/session-stream.ts  # WebSocket handler
│   └── web/             # React frontend (Vite + Tailwind)
│       └── src/
│           ├── App.tsx               # Root component + WebSocket wiring
│           ├── api/client.ts         # REST + WebSocket URL helpers
│           ├── components/chat/      # ChatPanel, Composer, MessageBubble
│           ├── components/layout/    # AppLayout (3-panel)
│           ├── hooks/useWebSocket.ts # WebSocket with reconnection
│           └── stores/session.ts     # Zustand chat state
├── package.json         # Workspace root
└── tsconfig.base.json   # Shared TypeScript config
```

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
