import { useEffect, useCallback } from "react";
import { useSessionStore } from "./stores/session";
import { useWebSocket } from "./hooks/useWebSocket";
import { api, wsUrl } from "./api/client";
import { AppLayout } from "./components/layout/AppLayout";
import type { BroworkEvent } from "./types";

export function App() {
  const sessionId = useSessionStore((s) => s.sessionId);
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const setStreaming = useSessionStore((s) => s.setStreaming);
  const appendAssistantDelta = useSessionStore((s) => s.appendAssistantDelta);
  const finalizeAssistantMessage = useSessionStore(
    (s) => s.finalizeAssistantMessage,
  );
  const addToolStart = useSessionStore((s) => s.addToolStart);
  const completeToolCall = useSessionStore((s) => s.completeToolCall);

  // Handle incoming WebSocket events from the server
  const handleMessage = useCallback(
    (event: BroworkEvent) => {
      switch (event.type) {
        case "agent_start":
          setStreaming(true);
          break;
        case "message_delta":
          appendAssistantDelta(event.text);
          break;
        case "message_end":
          finalizeAssistantMessage();
          break;
        case "tool_start":
          addToolStart(event.tool, event.args);
          break;
        case "tool_end":
          completeToolCall(event.tool, event.result, event.isError);
          break;
        case "agent_end":
          finalizeAssistantMessage();
          setStreaming(false);
          break;
        case "error":
          console.error("Server error:", event.message);
          setStreaming(false);
          break;
      }
    },
    [
      setStreaming,
      appendAssistantDelta,
      finalizeAssistantMessage,
      addToolStart,
      completeToolCall,
    ],
  );

  const { send, status } = useWebSocket({
    url: sessionId ? wsUrl(sessionId) : "",
    onMessage: handleMessage,
    enabled: !!sessionId,
  });

  // Auto-create a session on first load
  useEffect(() => {
    if (!sessionId) {
      api.sessions.create().then((s) => setSessionId(s.id));
    }
  }, [sessionId, setSessionId]);

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      useSessionStore.getState().addUserMessage(text);
      send({ type: "prompt", message: text });
    },
    [send],
  );

  const handleAbort = useCallback(() => {
    send({ type: "abort" });
  }, [send]);

  return (
    <AppLayout
      connectionStatus={status}
      onSendMessage={handleSendMessage}
      onAbort={handleAbort}
    />
  );
}
