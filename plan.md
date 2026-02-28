# User-Created Skills — Implementation Plan

## Concept

Today all skills are **admin-level**: bundled in `packages/skills/` or installed via `npm run install-skill` into `~/.pi/agent/skills/`. They're global to the server and shared across all users and sessions.

This plan introduces two new tiers of user-owned skills:

| Tier | Scope | Where on disk | How created |
|------|-------|---------------|-------------|
| **Session skill** | Single session only | `{workspace}/.pi/skills/{name}/` | Pi's `skill-creator` writes here during a session |
| **Installed user skill** | All sessions for that user | `{DATA_ROOT}/user-skills/{userId}/{name}/` | User "promotes" a session skill via a new API endpoint |

Admin skills remain unchanged — they're the system-level defaults.

---

## Step-by-step Implementation

### 1. Backend: User skill storage directory

**File:** `packages/server/src/services/skill-manager.ts`

- Add a `USER_SKILLS_DIR` constant: `{DATA_ROOT}/user-skills/{userId}/`
- Add functions:
  - `listUserSkills(userId)` → scans `{DATA_ROOT}/user-skills/{userId}/` and returns `SkillMeta[]` (reuses `scanSkillDirectory`)
  - `listSessionSkills(workspaceDir)` → scans `{workspaceDir}/.pi/skills/` and returns `SkillMeta[]`
  - `promoteSessionSkill(userId, workspaceDir, skillName)` → copies the skill directory from `{workspace}/.pi/skills/{name}/` to `{DATA_ROOT}/user-skills/{userId}/{name}/` (with validation: skillName must exist in session, no path traversal)
  - `deleteUserSkill(userId, skillName)` → removes the skill from `{DATA_ROOT}/user-skills/{userId}/{name}/`
  - `getUserSkill(userId, name)` → returns full `SkillContent` for a user skill
  - `getSessionSkill(workspaceDir, name)` → returns full `SkillContent` for a session-local skill

Key detail: When copying, we copy the **entire directory** (not just SKILL.md), since skills can have subdirectories and supporting code files.

### 2. Backend: Symlink user skills into Pi's discovery path

**File:** `packages/server/src/services/pi-session.ts` (in `createPiSession`)

Before creating the Pi session, symlink the user's installed skills into the session workspace's `.pi/skills/` directory so Pi discovers them alongside any session-local skills:

```
{workspace}/.pi/skills/{name} → {DATA_ROOT}/user-skills/{userId}/{name}
```

This way Pi's `DefaultResourceLoader` picks up both session-local AND user-installed skills automatically. No changes to Pi SDK needed.

We already symlink admin skills to `~/.pi/agent/skills/`. User skills get a different path (per-workspace symlinks) to keep them scoped to the right user's sessions.

### 3. Backend: New API routes

**File:** `packages/server/src/routes/skills.ts` (extend existing)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/skills/user` | List the authenticated user's installed skills |
| `GET` | `/skills/session/:sessionId` | List session-local skills (from workspace `.pi/skills/`) |
| `POST` | `/skills/user/promote` | Promote a session skill → `{ sessionId, skillName }` |
| `DELETE` | `/skills/user/:name` | Delete an installed user skill |

All endpoints require auth and scope to `req.user.id`.

The existing `GET /skills` endpoint continues to return admin (global) skills. The frontend will call both endpoints and merge them.

### 4. Backend: Extend skill_invoke to find user/session skills

**File:** `packages/server/src/ws/session-stream.ts`

Currently `skill_invoke` only checks the global skill map via `getSkill()`. Update the handler to also check:
1. Global admin skills (existing)
2. User's installed skills
3. Session-local skills (workspace `.pi/skills/`)

This is needed so the slash-command UI and `skill_start`/`skill_end` events work for user skills. Pi itself already discovers them via the filesystem — this is just for the Browork metadata layer.

### 5. Frontend: Extend SkillMeta type with a `source` field

**File:** `packages/web/src/stores/skills.ts`

Add a `source` discriminator to `SkillMeta`:

```typescript
export interface SkillMeta {
  name: string;
  description: string;
  enabled: boolean;
  source: "admin" | "user" | "session";
}
```

Update the Zustand store to hold three lists (or one merged list with the source tag):

```typescript
interface SkillsState {
  skills: SkillMeta[];          // admin (global) skills
  userSkills: SkillMeta[];      // user's installed skills
  sessionSkills: SkillMeta[];   // current session's local skills
  // ... existing fields
}
```

Add actions: `setUserSkills`, `setSessionSkills`, `promoteSkill`, `deleteUserSkill`.

### 6. Frontend: API client additions

**File:** `packages/web/src/api/client.ts`

```typescript
skills: {
  list: () => ...,                    // existing
  listUser: () => request<SkillMeta[]>("/skills/user"),
  listSession: (sessionId: string) => request<SkillMeta[]>(`/skills/session/${sessionId}`),
  promote: (sessionId: string, skillName: string) =>
    request<{ ok: boolean }>("/skills/user/promote", {
      method: "POST",
      body: JSON.stringify({ sessionId, skillName }),
    }),
  deleteUser: (name: string) =>
    request<{ ok: boolean }>(`/skills/user/${name}`, { method: "DELETE" }),
  toggle: ...,                        // existing
}
```

### 7. Frontend: Fetch user & session skills

**File:** `packages/web/src/App.tsx` (or wherever skills are loaded)

- On mount: fetch admin skills (`api.skills.list()`) AND user skills (`api.skills.listUser()`)
- On session change: fetch session skills (`api.skills.listSession(sessionId)`)

### 8. Frontend: StatusPanel redesign

**File:** `packages/web/src/components/layout/StatusPanel.tsx`

Redesign the skills section to show three grouped sections:

```
Skills (5)
├── Built-in                          ← admin skills
│   ├── chart-generator
│   └── financial-report
├── My Skills                         ← user installed (cross-session)
│   ├── custom-analysis    [×]        ← delete button
│   └── data-pipeline      [×]
└── Session                           ← session-local (if any exist)
    └── new-experiment     [↑]        ← promote button
```

- **Built-in** section: existing admin skills (no actions)
- **My Skills** section: user-installed skills with a delete (×) button
- **Session** section: only shown when current session has local skills; each has a promote (↑) button to install cross-session
- Promote button calls `api.skills.promote(sessionId, name)` then refreshes the user skills list
- Counts in the header reflect all three groups combined

### 9. Frontend: Slash command popup — merge all skill sources

**File:** `packages/web/src/components/chat/Composer.tsx`

The `/` slash-command popup currently filters `skills` from the store. Update it to merge `skills + userSkills + sessionSkills`, deduplicating by name. Optionally show a small badge (e.g., dim text like "local" or "mine") to distinguish sources.

### 10. Testing

**File:** `packages/server/src/__tests__/user-skills.test.ts` (new)

- Test `promoteSessionSkill`: copies skill dir correctly, validates path traversal blocked
- Test `listUserSkills` / `listSessionSkills`: returns expected metadata
- Test `deleteUserSkill`: removes directory
- Test API routes: 401 without auth, promote works, list returns merged results

---

## What this plan does NOT include (future work)

- **Sharing skills** between users (marked as future concern)
- **skill-creator skill itself** — we assume Pi already creates skills in `{workspace}/.pi/skills/` via its native skill-creator. If it doesn't exist yet, that's a separate Pi SDK feature
- **Persisting enable/disable state** for skills (existing limitation, orthogonal)
- **Hot-reloading** skills mid-session (Pi discovers skills at session creation time)

---

## File change summary

| File | Action |
|------|--------|
| `packages/server/src/services/skill-manager.ts` | Add user/session skill functions |
| `packages/server/src/services/pi-session.ts` | Symlink user skills into workspace before session creation |
| `packages/server/src/routes/skills.ts` | Add 4 new endpoints |
| `packages/server/src/ws/session-stream.ts` | Extend skill_invoke lookup |
| `packages/web/src/stores/skills.ts` | Add userSkills, sessionSkills state |
| `packages/web/src/api/client.ts` | Add user/session skill API methods |
| `packages/web/src/App.tsx` | Fetch user skills on mount, session skills on session change |
| `packages/web/src/components/layout/StatusPanel.tsx` | Grouped sections with promote/delete actions |
| `packages/web/src/components/chat/Composer.tsx` | Merge all skill sources in slash popup |
| `packages/server/src/__tests__/user-skills.test.ts` | New test file |
