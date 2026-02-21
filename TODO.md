# Browork — TODO

> Gaps between SPEC.md and current implementation, plus future enhancements.

## High Priority

### User-Defined Skills (Workflows)
- Pi natively discovers `SKILL.md` files in the project working directory
- Users can already upload a `my-workflow/SKILL.md` to their workspace and Pi will find it
- **Gap**: User-created skills don't appear as buttons in the Skills Bar
- Need to scan each user's workspace for skills on session connect (not just bundled `packages/skills/`)
- Consider a "Create Workflow" form in settings — name, description, instructions → saves as `SKILL.md`

### Thinking Level Toggle
- Pi SDK supports `session.setThinkingLevel()` at runtime
- Default level set at session creation (`DEFAULT_THINKING_LEVEL` env var) — working
- **Missing**: No UI toggle (Quick / Standard / Deep segmented control in Composer)
- **Missing**: No `PUT /api/sessions/:id/thinking-level` endpoint
- SPEC lines 213-230 describe the full UX

### AGENTS.md (Project Context)
- Pi natively reads `AGENTS.md` from the working directory for project-level instructions
- **Missing**: No default `AGENTS.md` seeded when a new user workspace is created
- **Missing**: No "Project Settings" / "Agent Instructions" editor in the UI
- SPEC lines 455-497 describe the template content and editor UX
- Should include a "Reset to Default" button

### Plan Progress Panel
- SPEC describes a collapsible panel showing multi-step plan progress (lines 101-109)
- Pi's `plan-mode` extension emits `plan-todo-list` and `plan-complete` custom messages
- **Missing**: No `PlanPanel` component
- **Missing**: No `plan_update` / `plan_complete` events in `BroworkEvent` type
- **Missing**: `plan-mode` extension not loaded in `createAgentSession` (only `pi-mcp-adapter` is)
- **Missing**: Event translator doesn't detect or translate plan events
- Need: Zustand plan store, event translation, collapsible UI panel

## Medium Priority

### Skill Management Endpoints
- `POST /api/skills/install` — install from npm, git, or local path (specced but not built)
- `DELETE /api/skills/:name` — remove a skill (specced but not built)
- Current skills are read-only from `packages/skills/` at startup

### Model Selector
- Pi supports `session.setModel()` for runtime model switching
- **Missing**: No admin UI for model selection
- **Missing**: No `PUT /api/sessions/:id/model` endpoint
- Could allow different models per skill type (cheap for cleaning, strong for analysis)

### Steer Command UI
- Backend handles `steer` WebSocket command (sends `session.steer()`)
- **Missing**: No frontend UI to trigger steering (e.g., "Actually, try it differently" button while agent is working)

### File Conflict Reload UI
- Server returns 409 when file modified externally during edit — working
- **Missing**: No user-facing "This file was updated by the agent. Reload?" notification
- The `FileEditorPane` catches 409 but doesn't offer a reload action

### CSV Editing Enhancements
- AG Grid inline cell editing — working
- **Missing**: Add/remove rows and columns (SPEC line 150-151)
- Current implementation is cell-edit only

### Security Headers
- Auth, path traversal protection, rate limiting, sandbox — all solid
- **Missing**: `@fastify/helmet` for CSP, X-Frame-Options, HSTS, X-Content-Type-Options
- nginx config has some headers, but not enforced at the app level

## Low Priority

### Assistant-UI Integration
- `@assistant-ui/react` is installed as a dependency but not used
- Chat is fully custom-built (MessageBubble, Composer, ToolCallCard)
- Decision: Either adopt assistant-ui for richer markdown/streaming or remove the unused dep
- Custom approach works fine — assistant-ui would add markdown rendering improvements

### File Watcher Per-User
- `file-watcher.ts` uses a singleton watcher pattern
- Works for the common case but could be improved to handle per-user watchers more cleanly
- Currently creates a new watcher per workspace path on first WebSocket connection

### Frontend Test Suite
- Server has 144 tests across 9 files
- **Missing**: No frontend tests (React component tests, integration tests)
- Could add Vitest + Testing Library for critical paths (auth flow, chat, file upload)

### File Viewer Enhancements
- Image preview, PDF embed — working via file download URLs
- **Missing**: Image zoom/pan controls
- **Missing**: Excel (.xlsx) read-only table preview (SPEC mentions first-sheet preview)

### WebSocket Reconnection UX
- Reconnection with exponential backoff — working
- Could add: "Reconnecting..." banner in the UI (currently just status dot in sidebar)
- Could add: Queue unsent messages during disconnect and replay on reconnect

### Logging & Monitoring
- Fastify's built-in Pino logger is active
- Could add: Structured log export (JSON to file/stdout for log aggregation)
- Could add: Basic metrics endpoint (active sessions, sandbox count, request latency)

## Cleanup

- Remove `@assistant-ui/react` from `packages/web/package.json` if not planning to adopt it
- The `todo` Pi extension is mentioned in SPEC (line 355) but not loaded — decide if needed alongside `plan-mode`
