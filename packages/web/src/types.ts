/** Events received from the server over WebSocket */
export type BroworkEvent =
  | { type: "agent_start" }
  | { type: "message_delta"; text: string }
  | { type: "message_end" }
  | { type: "tool_start"; tool: string; args: unknown }
  | { type: "tool_end"; tool: string; result: unknown; isError: boolean }
  | { type: "agent_end" }
  | { type: "skill_start"; skill: string; label: string }
  | { type: "skill_end"; skill: string }
  | { type: "files_changed"; paths: string[] }
  | { type: "context_usage"; tokens: number | null; contextWindow: number; percent: number | null }
  | { type: "error"; message: string };

/** Commands sent to the server over WebSocket */
export type BroworkCommand =
  | { type: "prompt"; message: string }
  | { type: "skill_invoke"; skill: string; args?: string }
  | { type: "abort" }
  | { type: "steer"; message: string }
  | { type: "compact" };
