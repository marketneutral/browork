/** Events received from the server over WebSocket */
export type BroworkEvent =
  | { type: "agent_start" }
  | { type: "message_delta"; text: string }
  | { type: "message_end" }
  | { type: "tool_start"; tool: string; args: unknown }
  | { type: "tool_end"; tool: string; result: unknown; isError: boolean }
  | { type: "agent_end" }
  | { type: "error"; message: string };

/** Commands sent to the server over WebSocket */
export type BroworkCommand =
  | { type: "prompt"; message: string }
  | { type: "abort" }
  | { type: "steer"; message: string };
