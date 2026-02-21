import { useEffect, useCallback } from "react";
import { useSessionStore } from "./stores/session";
import { useFilesStore } from "./stores/files";
import { useSkillsStore } from "./stores/skills";
import { useWebSocket } from "./hooks/useWebSocket";
import { api, wsUrl } from "./api/client";
import { AppLayout } from "./components/layout/AppLayout";
import type { BroworkEvent } from "./types";

/** Refresh the session list in the sidebar */
function refreshSessions() {
  api.sessions
    .list()
    .then((sessions) => useSessionStore.getState().setSessions(sessions))
    .catch(console.error);
}

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
          // Refresh session list to update lastMessage preview
          refreshSessions();
          break;
        case "skill_start":
          useSkillsStore.getState().setActiveSkill(event.skill, event.label);
          break;
        case "skill_end":
          useSkillsStore.getState().clearActiveSkill();
          break;
        case "files_changed":
          api.files.list().then(useFilesStore.getState().setEntries).catch(console.error);
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

  // Load sessions and auto-create if none exist
  useEffect(() => {
    api.sessions.list().then((sessions) => {
      useSessionStore.getState().setSessions(sessions);
      if (sessions.length > 0 && !sessionId) {
        // Select most recent session
        selectSession(sessions[0].id);
      } else if (sessions.length === 0) {
        // First time — create a session
        api.sessions.create().then((s) => {
          refreshSessions();
          selectSession(s.id);
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load available skills on mount
  useEffect(() => {
    api.skills
      .list()
      .then((skills) => useSkillsStore.getState().setSkills(skills))
      .catch(console.error);
  }, []);

  // Select a session and load its message history
  const selectSession = useCallback(
    (id: string) => {
      setSessionId(id);
      api.sessions.get(id).then((data) => {
        if (data.messages && data.messages.length > 0) {
          useSessionStore.getState().setMessages(
            data.messages.map((m) => ({
              id: `msg-${m.id}`,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
            })),
          );
        }
      }).catch(console.error);
    },
    [setSessionId],
  );

  const handleNewSession = useCallback(() => {
    api.sessions.create().then((s) => {
      refreshSessions();
      selectSession(s.id);
    });
  }, [selectSession]);

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id === sessionId) return;
      selectSession(id);
    },
    [sessionId, selectSession],
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      api.sessions.delete(id).then(() => {
        refreshSessions();
        if (id === sessionId) {
          // Switch to another session or create new
          api.sessions.list().then((sessions) => {
            if (sessions.length > 0) {
              selectSession(sessions[0].id);
            } else {
              api.sessions.create().then((s) => {
                refreshSessions();
                selectSession(s.id);
              });
            }
          });
        }
      });
    },
    [sessionId, selectSession],
  );

  const handleRenameSession = useCallback((id: string, name: string) => {
    api.sessions.rename(id, name).then(() => refreshSessions());
  }, []);

  const handleForkSession = useCallback(
    (id: string) => {
      api.sessions.fork(id).then((forked) => {
        refreshSessions();
        selectSession(forked.id);
      });
    },
    [selectSession],
  );

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      useSessionStore.getState().addUserMessage(text);
      send({ type: "prompt", message: text });
    },
    [send],
  );

  const handleInvokeSkill = useCallback(
    (skillName: string, args?: string) => {
      useSessionStore
        .getState()
        .addUserMessage(args ? `[Workflow: ${skillName}] ${args}` : `[Workflow: ${skillName}]`);
      send({ type: "skill_invoke", skill: skillName, args });
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
      onInvokeSkill={handleInvokeSkill}
      onAbort={handleAbort}
      onNewSession={handleNewSession}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
      onRenameSession={handleRenameSession}
      onForkSession={handleForkSession}
    />
  );
}
