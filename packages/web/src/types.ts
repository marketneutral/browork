/** Events received from the server over WebSocket */
export type BroworkEvent =
  | { type: "agent_start" }
  | { type: "message_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "message_end" }
  | { type: "tool_start"; tool: string; args: unknown }
  | { type: "tool_end"; tool: string; result: unknown; isError: boolean }
  | { type: "agent_end" }
  | { type: "skill_start"; skill: string; label: string }
  | { type: "skill_end"; skill: string }
  | { type: "files_changed"; paths: string[] }
  | { type: "context_usage"; tokens: number | null; contextWindow: number; percent: number | null }
  | { type: "session_info"; sandboxActive: boolean; thinkingLevel: string }
  | { type: "thinking_level_changed"; level: string }
  | { type: "ask_user"; requestId: string; questions: AskUserQuestion[] }
  | { type: "subagent_start"; subagentId: string; name: string; task: string; activeTools: string[] }
  | { type: "subagent_tool_start"; subagentId: string; tool: string; args: unknown }
  | { type: "subagent_tool_end"; subagentId: string; tool: string; result: unknown; isError: boolean }
  | { type: "subagent_message_delta"; subagentId: string; text: string }
  | { type: "subagent_end"; subagentId: string; result: string; isError: boolean }
  | { type: "budget_status"; used: number; limit: number; remaining: number; percent: number | null; resetsAt: string; overBudget: boolean }
  | { type: "error"; message: string };

/** Image attachment sent with a user prompt */
export interface ImageAttachment {
  data: string;     // base64-encoded
  mimeType: string; // e.g. "image/png"
}

/** Commands sent to the server over WebSocket */
export type BroworkCommand =
  | { type: "prompt"; message: string; images?: ImageAttachment[] }
  | { type: "skill_invoke"; skill: string; args?: string }
  | { type: "abort" }
  | { type: "steer"; message: string }
  | { type: "compact" }
  | { type: "set_thinking_level"; level: "none" | "low" | "medium" | "high" }
  | { type: "ask_user_response"; requestId: string; answers: AskUserAnswer[] };

// ── ask_user types ──

export interface AskUserOption {
  label: string;
  description?: string;
}

export interface AskUserQuestion {
  question: string;
  options: AskUserOption[];
  multiSelect?: boolean;
  allowOther?: boolean;
}

export interface AskUserAnswer {
  question: string;
  selected: string[];
}
