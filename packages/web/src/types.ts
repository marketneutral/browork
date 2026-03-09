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
  | { type: "session_info"; sandboxActive: boolean }
  | { type: "ask_user"; requestId: string; questions: AskUserQuestion[] }
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
