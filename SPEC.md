# Browork — Project Specification

> A web-based UI for non-technical financial analysts to operate the Pi coding agent.

## 1. Problem Statement

Financial analysts need to use AI coding agents (Pi) to process, transform, and
analyze data files — but Pi's terminal interface is designed for developers. These
analysts are comfortable with web apps (Bloomberg, Excel Online, Google Drive) but
not terminals. They need a familiar, file-centric interface that hides all
technical complexity.

## 2. Target User

- **Role**: Financial analyst (non-technical)
- **Platform**: Windows desktop, accessing via Chrome/Edge
- **Comfort zone**: Web apps, file uploads, chat interfaces
- **Not comfortable with**: Terminals, CLI, git, code editors

## 3. High-Level Architecture

```
┌──────────────────────────┐            ┌───────────────────────────────────────┐
│   Analyst's PC (Windows) │            │   Linux Server                        │
│                          │            │                                       │
│   Browser (Chrome/Edge)  │── HTTPS ──▶│   Browork Server (Node.js)            │
│                          │◀── WSS ────│   ├── REST API (file mgmt, sessions)  │
│   React SPA              │            │   ├── WebSocket (streaming events)     │
│   ├── Chat panel         │            │   ├── Pi SDK (AgentSession per user)   │
│   ├── File manager       │            │   └── Working directories (/data/...)  │
│   └── Status/output view │            │                                       │
└──────────────────────────┘            │   Pi Agent                            │
                                        │   ├── read / write / edit / bash      │
                                        │   └── operates on user's work dir     │
                                        └───────────────────────────────────────┘
```

### Why this architecture?

| Decision | Rationale |
|----------|-----------|
| **Web app, not Electron** | Zero install for analysts. No Docker Desktop, no WSL2, no IT tickets. They open a URL. |
| **Pi SDK, not RPC** | The Node.js SDK (`createAgentSession()`) gives full programmatic control — sessions, events, tools, thinking levels — without managing subprocesses. |
| **WebSocket for streaming** | Pi streams events (message deltas, tool execution, agent status). WebSocket delivers these to the browser in real-time. |
| **Server-side Pi** | Pi needs Linux, filesystem access, and bash. It runs on the server, never in the browser. |

## 4. Core User Workflow

```
1. Analyst logs in → sees their workspace
2. Uploads files (drag & drop) → files land in their working directory on the server
3. Opens a chat session → Pi agent is scoped to that working directory
4. Types natural language requests:
   "Clean up the column headers in Q4_revenue.xlsx"
   "Merge these three CSVs by date and ticker"
   "Calculate YoY growth rates and save as a new sheet"
5. Sees Pi working (streaming status, tool calls)
6. Views/downloads output files from the file panel
7. Can branch the conversation ("actually, try it a different way")
```

## 5. UI Design

### Layout (3-panel + plan overlay)

```
┌──────────┬──────────────────────────┬──────────────┐
│          │  ┌─ Plan Progress ─────┐ │              │
│ Sessions │  │ ✓ 1. Read input     │ │   File       │
│ Sidebar  │  │ ✓ 2. Clean headers  │ │   Manager    │
│          │  │ ▸ 3. Merge by date  │ │              │
│ • Active │  │ ○ 4. Calculate YoY  │ │ work/        │
│ • Recent │  │ ○ 5. Save output    │ │ ├─ input/    │
│ • Search │  └─────────── 2/5 ─────┘ │ ├─ output/   │
│          │                          │ └─ Q4.xlsx   │
│          │  ┌────────────────────┐  │              │
│          │  │ Chat messages      │  │              │
│          │  │ (scrolling)        │  │              │
│          │  └────────────────────┘  │              │
│          │  ┌────────────────────┐  │              │
│          │  │ Workflows:         │  │              │
│          │  │ [Clean] [Merge]    │  │              │
│          │  │ [Report] [Chart]   │  │ [Upload]     │
│          │  ├────────────────────┤  │ [Download]   │
│          │  │ Message input      │  │              │
│          │  └────────────────────┘  │              │
└──────────┴──────────────────────────┴──────────────┘
```

The Plan Progress panel appears at the top of the chat area when the agent is
working through a multi-step task. It collapses automatically when there is no
active plan, and can be manually collapsed/expanded by the user.

### Sessions Sidebar (left)
- List of chat sessions, most recent first
- Each session shows: name, last message preview, timestamp
- "New Session" button
- Sessions can be renamed, archived

### Plan Progress Panel (top of center, contextual)
- Appears automatically when Pi produces a numbered plan
- Shows each step as a checklist item with three states:
  - **Done** (checkmark): step completed
  - **In progress** (spinner): currently executing
  - **Pending** (empty circle): not yet started
- Progress summary in the corner (e.g., "2/5")
- Collapsible — auto-expands when a plan is active, user can minimize
- Disappears when there is no active plan (simple one-off requests)

### Skills Bar (above message input)
- Horizontal row of skill buttons above the message input area
- Each button shows the skill's name and a short description on hover
- Clicking a skill button populates the message input with the skill invocation
  and optionally opens a small form for skill-specific arguments
- Skills are presented as **"Workflows"** in the UI — the word "skill" is too
  technical for the target user
- Example buttons: `Clean Data`, `Merge Files`, `Financial Report`, `Chart`
- An admin/settings page allows enabling/disabling skills and installing new ones
- When Pi auto-loads a skill (model-initiated), a subtle "Using: Clean Data"
  badge appears on the agent's response

### Chat Panel (center)
- Scrolling message history
- User messages in bubbles (right-aligned)
- Agent messages rendered as markdown (left-aligned)
- Tool execution shown as collapsible cards:
  - "Reading Q4_revenue.xlsx..." with a spinner
  - Expandable to show details (for curious users, collapsed by default)
- Skill invocation shown as a labeled badge on the message (e.g., "Workflow: Clean Data")
- Status bar: "Agent is thinking...", "Running bash command...", "Done"
- Message input at bottom with:
  - Text area (Shift+Enter for newline, Enter to send)
  - Attach button (reference files from working directory)

### File Manager (right)
- Tree view of the user's working directory
- Drag-and-drop upload zone
- File actions: download, preview, delete
- Auto-refreshes when Pi creates/modifies files
- Preview support for: CSV (table view), images, text, PDF
- Upload progress indicator

## 6. Backend Design

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Runtime** | Node.js (LTS) | Pi SDK is TypeScript/Node.js native |
| **HTTP framework** | Fastify | Fast, typed, good WebSocket support via `@fastify/websocket` |
| **WebSocket** | `@fastify/websocket` | Streaming Pi events to the browser |
| **Pi integration** | `@mariozechner/pi-coding-agent` SDK | `createAgentSession()` for full agent lifecycle control |
| **File storage** | Local filesystem | Each user gets a working directory under a configurable root |
| **Auth** | Simple token-based (initially) | Can be upgraded to SSO/OIDC later |
| **Database** | SQLite (via `better-sqlite3`) | User accounts, session metadata. Lightweight, zero-config. |

### API Endpoints

#### Auth
```
POST   /api/auth/login          → { token }
POST   /api/auth/logout
GET    /api/auth/me              → { user }
```

#### Sessions
```
GET    /api/sessions             → [{ id, name, createdAt, lastMessage }]
POST   /api/sessions             → { id }  (creates new session + Pi AgentSession)
GET    /api/sessions/:id         → { id, name, messages }
DELETE /api/sessions/:id
PATCH  /api/sessions/:id         → { name }  (rename)
POST   /api/sessions/:id/fork    → { newId }  (branch conversation)
```

#### Files
```
GET    /api/files                → [{ name, path, size, modified, type }]  (tree)
POST   /api/files/upload         → multipart upload to working directory
GET    /api/files/:path          → file download
DELETE /api/files/:path
GET    /api/files/:path/preview  → preview data (CSV→JSON, text, image thumbnail)
```

#### Skills (Workflows)
```
GET    /api/skills                  → [{ name, description, enabled }]
POST   /api/skills/install          → { source }  (npm, git, or local path)
DELETE /api/skills/:name
PATCH  /api/skills/:name            → { enabled }  (toggle on/off)
POST   /api/sessions/:id/skill/:name → invoke skill with optional args
```

#### WebSocket
```
WS     /api/sessions/:id/stream
```

Events sent over WebSocket (mirroring Pi's event model):
```jsonc
{ "type": "agent_start" }
{ "type": "message_delta", "text": "I'll start by..." }
{ "type": "tool_start", "tool": "read", "args": { "path": "Q4.xlsx" } }
{ "type": "tool_end", "tool": "read", "result": "..." }
{ "type": "message_end" }
{ "type": "agent_end" }
{ "type": "files_changed", "paths": ["output/cleaned.csv"] }

// Plan & task tracking events (from Pi extensions)
{ "type": "plan_update", "steps": [
    { "label": "Read input files", "status": "done" },
    { "label": "Clean column headers", "status": "done" },
    { "label": "Merge by date", "status": "in_progress" },
    { "label": "Calculate YoY growth", "status": "pending" },
    { "label": "Save output", "status": "pending" }
  ], "completed": 2, "total": 5 }
{ "type": "plan_complete" }
```

Commands sent by client over WebSocket:
```jsonc
{ "type": "prompt", "message": "Clean up Q4_revenue.xlsx" }
{ "type": "skill_invoke", "skill": "data-cleaning", "args": "focus on Q4_revenue.xlsx" }
{ "type": "abort" }
{ "type": "steer", "message": "Actually, keep the original headers" }
```

Skill-related events sent by server:
```jsonc
// When a skill is invoked (user-initiated via button or model-initiated)
{ "type": "skill_start", "skill": "data-cleaning", "label": "Clean Data" }
// When skill execution completes
{ "type": "skill_end", "skill": "data-cleaning" }
```

### Pi SDK Integration

```typescript
// Pseudocode — how the backend manages a session

import { createAgentSession } from "@mariozechner/pi-coding-agent";

async function createSession(userId: string, workDir: string) {
  const { session } = await createAgentSession({
    workingDirectory: workDir,
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    thinkingLevel: "medium",
    // Load plan-mode and todo extensions for structured task tracking
    extensions: ["plan-mode", "todo"],
  });

  // Stream events to the user's WebSocket
  session.subscribe((event) => {
    const ws = getWebSocket(userId);
    ws.send(JSON.stringify(mapPiEventToBroworkEvent(event)));
  });

  return session;
}
```

### Pi Extensions Strategy

Pi's core is deliberately minimal. We load two example extensions to get
structured planning and task tracking:

| Extension | What it gives us | How we use it |
|-----------|-----------------|---------------|
| **plan-mode** | Two-phase workflow: read-only planning → tracked execution. Emits custom messages (`plan-todo-list`, `plan-complete`) and tracks `TodoItem[]` with `[DONE:n]` markers. | Backend intercepts plan-related custom messages from Pi and translates them into `plan_update` WebSocket events for the frontend. |
| **todo** | A `todo` tool the LLM can call (`add`, `toggle`, `list`, `clear`). State persists in session via tool result details. | Backend extracts todo state from tool results and forwards as `todo_update` WebSocket events. |

The backend's `pi-session.ts` service acts as a **translation layer**: it
subscribes to Pi's event stream, detects plan/todo custom messages and tool
results, and emits normalized events over WebSocket that the React frontend
can render without knowing Pi's internal extension format.

### Skills (Workflows) Integration

Pi skills are Markdown files (`SKILL.md`) with YAML frontmatter, following the
open [Agent Skills standard](https://agentskills.io/specification). They provide
specialized, reusable workflows — perfect for financial analyst tasks.

#### How Skills Work in Pi

```
~/.pi/agent/skills/              # Global skills directory
  data-cleaning/
    SKILL.md                     # YAML frontmatter + Markdown instructions
    scripts/clean.py             # Optional helper scripts
    references/column-rules.md   # Optional reference docs
  excel-merge/
    SKILL.md
```

A `SKILL.md` looks like:
```markdown
---
name: data-cleaning
description: Clean and standardize financial data files. Handles column
  renaming, date normalization, currency formatting, and deduplication.
---

# Data Cleaning

## Steps
1. Read the input file and detect format (CSV, XLSX, etc.)
2. Standardize column headers to snake_case
3. Normalize date columns to YYYY-MM-DD
4. Format currency columns to 2 decimal places
5. Remove duplicate rows
6. Save cleaned output to the output/ directory

## Rules
- Never modify the original file — always write to output/
- Preserve all original columns unless explicitly asked to drop
...
```

#### Invocation Flow

Two paths, both surfaced in the UI:

**User-initiated (button click):**
1. User clicks "Clean Data" workflow button in the UI
2. Frontend sends `{ "type": "skill_invoke", "skill": "data-cleaning", "args": "..." }`
3. Backend expands the skill: reads `SKILL.md`, strips frontmatter, wraps in
   `<skill>` XML tags, appends user args, sends as a prompt to Pi's session
4. Pi agent follows the skill instructions

**Model-initiated (automatic):**
1. Pi's system prompt includes available skill descriptions
2. When the model detects a task matching a skill, it uses `read` to load
   the full `SKILL.md` content on its own
3. Backend detects the skill read via tool events and emits `skill_start`

#### Skill Management

Skills are managed server-side. The backend:
- Discovers skills from configurable directories on startup
- Serves the skill list to the frontend via `GET /api/skills`
- Supports installing skills from npm or git (`pi install npm:@org/skill`)
- Allows enabling/disabling per skill

#### Bundled Skills (Financial Analyst Starter Pack)

We will create a set of domain-specific skills for the target user:

| Skill | Description |
|-------|-------------|
| `data-cleaning` | Standardize headers, dates, currencies. Deduplicate rows. |
| `excel-merge` | Merge multiple Excel/CSV files by shared key columns. |
| `financial-report` | Generate summary reports with key metrics (YoY, QoQ, margins). |
| `chart-generator` | Create charts/visualizations from data and save as images. |
| `pivot-table` | Create pivot-table-style summaries from flat data. |
| `data-validation` | Check for missing values, outliers, and format inconsistencies. |

These ship as a `browork-skills` package in the monorepo under `packages/skills/`.

### File Watching

Use `chokidar` to watch each user's working directory. When Pi creates or
modifies files, push a `files_changed` event over WebSocket so the file panel
updates in real-time.

## 7. Frontend Design

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | React 19 | Ecosystem, component model, familiar |
| **Build tool** | Vite | Fast dev server, good defaults |
| **Styling** | Tailwind CSS v4 | Utility-first, consistent with Pi's own web-ui |
| **State** | Zustand | Lightweight, no boilerplate |
| **Markdown** | `react-markdown` + `remark-gfm` | Render agent responses |
| **File upload** | `react-dropzone` | Drag-and-drop UX |
| **WebSocket** | Native `WebSocket` + reconnection wrapper | Real-time streaming |
| **Icons** | Lucide React | Clean, consistent |
| **Data tables** | TanStack Table | CSV preview in file panel |

### Key Components

```
App
├── AuthGate                    (login screen if not authenticated)
├── AppLayout
│   ├── SessionSidebar          (left panel)
│   │   ├── NewSessionButton
│   │   └── SessionList
│   │       └── SessionItem     (name, preview, timestamp)
│   ├── PlanPanel                (top of center, contextual)
│   │   ├── PlanStepList
│   │   │   └── PlanStep        (checkbox + label + status icon)
│   │   ├── PlanProgress        ("2/5" summary)
│   │   └── CollapseToggle
│   ├── ChatPanel               (center)
│   │   ├── MessageList
│   │   │   ├── UserMessage
│   │   │   ├── AgentMessage    (markdown rendered)
│   │   │   ├── SkillBadge      ("Workflow: Clean Data" on relevant messages)
│   │   │   └── ToolCallCard    (collapsible, shows tool name + status)
│   │   ├── AgentStatusBar      ("Thinking...", "Running bash...", "Done")
│   │   ├── SkillsBar           (workflow buttons above input)
│   │   │   └── SkillButton     (icon + label, triggers skill invocation)
│   │   └── MessageInput
│   │       ├── TextArea
│   │       └── AttachButton
│   └── FilePanel               (right panel, collapsible)
│       ├── FileTree
│       ├── UploadZone          (drag & drop)
│       ├── FilePreview         (CSV table, text, image, PDF)
│       └── FileActions         (download, delete)
```

## 8. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| **Pi has bash access** | Each user's Pi session is scoped to their working directory. Consider running Pi in a sandboxed environment (container per user) for production. |
| **File upload attacks** | Validate file types, enforce size limits, scan filenames for path traversal. |
| **Multi-user isolation** | Separate working directories per user. Pi sessions are isolated. |
| **Auth** | Token-based auth with expiry. HTTPS only. |
| **LLM API keys** | Stored server-side only, never exposed to the browser. |

## 9. Project Structure

```
browork/
├── packages/
│   ├── server/                  # Fastify backend
│   │   ├── src/
│   │   │   ├── index.ts         # Entry point
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── sessions.ts
│   │   │   │   ├── files.ts
│   │   │   │   └── skills.ts       # Skills CRUD + invoke
│   │   │   ├── services/
│   │   │   │   ├── pi-session.ts    # Pi SDK wrapper
│   │   │   │   ├── skill-manager.ts # Discover, load, install skills
│   │   │   │   ├── file-watcher.ts  # chokidar file watching
│   │   │   │   └── user.ts
│   │   │   ├── ws/
│   │   │   │   └── session-stream.ts  # WebSocket handler
│   │   │   └── db/
│   │   │       └── schema.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── skills/                  # Bundled financial analyst skills
│   │   ├── data-cleaning/
│   │   │   └── SKILL.md
│   │   ├── excel-merge/
│   │   │   └── SKILL.md
│   │   ├── financial-report/
│   │   │   └── SKILL.md
│   │   ├── chart-generator/
│   │   │   └── SKILL.md
│   │   ├── pivot-table/
│   │   │   └── SKILL.md
│   │   ├── data-validation/
│   │   │   └── SKILL.md
│   │   └── package.json
│   └── web/                     # React frontend
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── SessionSidebar/
│       │   │   ├── PlanPanel/
│       │   │   ├── ChatPanel/
│       │   │   ├── SkillsBar/
│       │   │   ├── FilePanel/
│       │   │   └── common/
│       │   ├── stores/
│       │   │   ├── session.ts
│       │   │   ├── plan.ts
│       │   │   ├── skills.ts
│       │   │   ├── files.ts
│       │   │   └── auth.ts
│       │   ├── hooks/
│       │   │   ├── useWebSocket.ts
│       │   │   └── usePiSession.ts
│       │   └── api/
│       │       └── client.ts
│       ├── package.json
│       ├── vite.config.ts
│       └── tsconfig.json
├── package.json                 # Workspace root
├── tsconfig.base.json
├── SPEC.md
└── LICENSE
```

## 10. Development Phases

### Phase 1 — Walking Skeleton
- [ ] Monorepo setup (npm workspaces, TypeScript, ESLint)
- [ ] Fastify server with health check
- [ ] Vite + React app with hardcoded layout
- [ ] WebSocket connection between frontend and backend
- [ ] Single Pi session via SDK, prompt → response round-trip
- [ ] **Milestone**: Type a message in the browser, see Pi's response stream back

### Phase 2 — File Management
- [ ] File upload endpoint (multipart)
- [ ] File tree API + frontend component
- [ ] File download
- [ ] File preview (CSV, text, images)
- [ ] Chokidar file watching → WebSocket push
- [ ] Drag-and-drop upload in the UI
- [ ] **Milestone**: Upload a CSV, ask Pi to process it, see the output file appear

### Phase 3 — Skills (Workflows)
- [ ] Skill discovery and loading on the backend (`skill-manager.ts`)
- [ ] Skills API endpoints (list, invoke)
- [ ] SkillsBar component with workflow buttons
- [ ] Skill invocation via WebSocket (`skill_invoke` → expanded prompt)
- [ ] SkillBadge on agent messages when a skill is active
- [ ] Write bundled financial analyst skills (data-cleaning, excel-merge, etc.)
- [ ] **Milestone**: Click "Clean Data", Pi follows the skill instructions on uploaded files

### Phase 4 — Session Management
- [ ] SQLite database for session metadata
- [ ] Create/list/rename/delete sessions API
- [ ] Session sidebar in frontend
- [ ] Session persistence (Pi's JSONL sessions)
- [ ] Session forking (branching conversations)
- [ ] **Milestone**: Multiple sessions, switch between them, pick up where you left off

### Phase 5 — Auth & Multi-User
- [ ] User accounts (SQLite)
- [ ] Token-based authentication
- [ ] Per-user working directories
- [ ] Login/logout UI
- [ ] **Milestone**: Two users can use the system simultaneously with isolated workspaces

### Phase 6 — Polish & Production Readiness
- [ ] Error handling and user-friendly error messages
- [ ] Loading states and skeleton screens
- [ ] Mobile-responsive layout (tablet at minimum)
- [ ] Rate limiting
- [ ] Logging and monitoring
- [ ] Deployment configuration (systemd, nginx reverse proxy, TLS)
- [ ] Container-per-user sandboxing for Pi sessions (optional)

## 11. Open Questions

1. **LLM Provider**: Which LLM provider/model should Pi use by default? (Anthropic Claude is the natural choice, but Pi supports many.)
2. **File size limits**: What's the max upload size? Financial files can be large (100MB+ Excel files).
3. **Concurrent sessions**: Can one user run multiple Pi sessions in parallel, or one at a time?
4. **Data retention**: How long are files and sessions kept? Auto-cleanup policy?
5. **Deployment**: Single server, or should we plan for horizontal scaling from the start?
