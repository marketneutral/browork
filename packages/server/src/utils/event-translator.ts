import type { BroworkEvent } from "../services/pi-session.js";

/**
 * Translate a Pi SDK event into a Browork WebSocket event.
 * Returns null for events we don't forward to the frontend.
 */
export function translatePiEvent(event: any): BroworkEvent | null {
  // Debug: log all Pi events to help diagnose connectivity
  if (process.env.DEBUG_PI_EVENTS) {
    console.log("[Pi event]", event.type, event.assistantMessageEvent?.type ?? "");
  }

  switch (event.type) {
    case "agent_start":
      return { type: "agent_start" };

    case "message_update": {
      const ame = event.assistantMessageEvent;
      if (ame?.type === "text_delta") {
        return { type: "message_delta", text: ame.delta };
      }
      return null;
    }

    case "message_end":
      return { type: "message_end" };

    case "tool_execution_start":
      return {
        type: "tool_start",
        tool: event.toolName,
        args: event.args,
      };

    case "tool_execution_end":
      return {
        type: "tool_end",
        tool: event.toolName,
        result: event.result,
        isError: event.isError,
      };

    case "agent_end":
      return { type: "agent_end" };

    default:
      return null;
  }
}
