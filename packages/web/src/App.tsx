import { useEffect, useCallback } from "react";
import { useSessionStore } from "./stores/session";
import { useFilesStore } from "./stores/files";
import { useSkillsStore } from "./stores/skills";
import { useWebSocket } from "./hooks/useWebSocket";
import { api, wsUrl } from "./api/client";
import { AppLayout } from "./components/layout/AppLayout";
import { ErrorToast } from "./components/ui/ErrorToast";
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
  const setLoading = useSessionStore((s) => s.setLoading);
  const setError = useSessionStore((s) => s.setError);
  const error = useSessionStore((s) => s.error);
  const appendAssistantDelta = useSessionStore((s) => s.appendAssistantDelta);
  const finalizeAssistantMessage = useSessionStore(
    (s) => s.finalizeAssistantMessage,
  );
  const addToolStart = useSessionStore((s) => s.addToolStart);
  const completeToolCall = useSessionStore((s) => s.completeToolCall);
  const finalizeToolCalls = useSessionStore((s) => s.finalizeToolCalls);

  // Handle incoming WebSocket events from the server
  const handleMessage = useCallback(
    (event: BroworkEvent) => {
      switch (event.type) {
        case "agent_start":
          setStreaming(true);
          break;
        case "message_delta":
          if (!useSessionStore.getState().isStreaming) setStreaming(true);
          appendAssistantDelta(event.text);
          break;
        case "message_end":
          finalizeAssistantMessage();
          break;
        case "tool_start":
          if (!useSessionStore.getState().isStreaming) setStreaming(true);
          addToolStart(event.tool, event.args);
          break;
        case "tool_end":
          completeToolCall(event.tool, event.result, event.isError);
          break;
        case "agent_end":
          finalizeAssistantMessage();
          finalizeToolCalls();
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
        case "context_usage":
          useSessionStore.getState().setContextUsage({
            tokens: event.tokens,
            contextWindow: event.contextWindow,
            percent: event.percent,
          });
          break;
        case "files_changed": {
          const currentSessionId = useSessionStore.getState().sessionId;
          if (currentSessionId) {
            api.files.list(currentSessionId).then(useFilesStore.getState().setEntries).catch(console.error);
          }
          break;
        }
        case "error":
          setError(event.message);
          setStreaming(false);
          break;
      }
    },
    [
      setStreaming,
      setError,
      appendAssistantDelta,
      finalizeAssistantMessage,
      addToolStart,
      completeToolCall,
      finalizeToolCalls,
    ],
  );

  const { send, status } = useWebSocket({
    url: sessionId ? wsUrl(sessionId) : "",
    onMessage: handleMessage,
    enabled: !!sessionId,
  });

  // Load sessions and auto-create if none exist
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    api.sessions
      .list()
      .then((sessions) => {
        if (ignore) return;
        useSessionStore.getState().setSessions(sessions);
        if (sessions.length > 0 && !sessionId) {
          selectSession(sessions[0].id);
        } else if (sessions.length === 0) {
          api.sessions.create().then((s) => {
            if (ignore) return;
            refreshSessions();
            selectSession(s.id);
          });
        }
      })
      .catch((err) => { if (!ignore) setError(err.message); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load available skills on mount
  useEffect(() => {
    api.skills
      .list()
      .then((skills) => useSkillsStore.getState().setSkills(skills))
      .catch(console.error);
  }, []);

  // Load MCP servers + tools on mount, then poll every 10s for status changes
  useEffect(() => {
    const refreshMcp = async () => {
      try {
        const servers = await api.mcp.list();
        useSkillsStore.getState().setMcpServers(
          servers.map((s) => ({
            name: s.name,
            url: s.url,
            status: s.status,
            toolCount: s.toolCount,
            error: s.error,
          })),
        );
        const connected = servers.filter(
          (s) => s.status === "connected" && s.toolCount > 0,
        );
        const toolArrays = await Promise.all(
          connected.map(async (server) => {
            const tools = await api.mcp.tools(server.name);
            return tools.map((t) => ({
              ...t,
              serverName: server.name,
            }));
          }),
        );
        useSkillsStore.getState().setMcpTools(toolArrays.flat());
      } catch {
        // ignore — server may not be up yet
      }
    };

    refreshMcp();
    const interval = setInterval(refreshMcp, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Select a session and load its message history + files
  const selectSession = useCallback(
    (id: string) => {
      setSessionId(id);
      // Clear file state and reload for the new session
      useFilesStore.getState().clearAll();
      api.files.list(id).then(useFilesStore.getState().setEntries).catch(console.error);
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
      }).catch((err) => setError(err.message));
    },
    [setSessionId, setError],
  );

  const handleNewSession = useCallback(() => {
    api.sessions.create().then((s) => {
      refreshSessions();
      selectSession(s.id);
    }).catch((err) => setError(err.message));
  }, [selectSession, setError]);

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
      }).catch((err) => setError(err.message));
    },
    [sessionId, selectSession, setError],
  );

  const handleRenameSession = useCallback((id: string, name: string) => {
    api.sessions.rename(id, name).then(() => refreshSessions()).catch((err) => setError(err.message));
  }, [setError]);

  const handleForkSession = useCallback(
    (id: string) => {
      api.sessions.fork(id).then((forked) => {
        refreshSessions();
        selectSession(forked.id);
      }).catch((err) => setError(err.message));
    },
    [selectSession, setError],
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

  const handleCompact = useCallback(() => {
    send({ type: "compact" });
  }, [send]);

  return (
    <>
      {error && (
        <ErrorToast message={error} onDismiss={() => setError(null)} />
      )}
      <AppLayout
        connectionStatus={status}
        onSendMessage={handleSendMessage}
        onInvokeSkill={handleInvokeSkill}
        onAbort={handleAbort}
        onCompact={handleCompact}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onForkSession={handleForkSession}
      />
    </>
  );
}
