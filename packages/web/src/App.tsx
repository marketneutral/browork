import { useEffect, useCallback } from "react";
import { useSessionStore } from "./stores/session";
import { useFilesStore } from "./stores/files";
import { useSkillsStore } from "./stores/skills";
import { useWebSocket } from "./hooks/useWebSocket";
import { api, wsUrl } from "./api/client";
import { AppLayout } from "./components/layout/AppLayout";
import { ErrorToast } from "./components/ui/ErrorToast";
import type { BroworkEvent, AskUserAnswer } from "./types";

/** Refresh the session list in the sidebar */
function refreshSessions() {
  api.sessions
    .list()
    .then((sessions) => useSessionStore.getState().setSessions(sessions))
    .catch(console.error);
}

/** Refresh which sessions have a running agent */
function refreshRunningSessions() {
  api.sessions
    .running()
    .then(({ sessionIds, previews }) => useSessionStore.getState().setRunningSessions(sessionIds, previews))
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
          useSessionStore.getState().clearPendingImages();
          refreshRunningSessions();
          break;
        case "thinking_delta":
          useSessionStore.getState().appendThinkingDelta(event.text);
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
        case "ask_user":
          useSessionStore.getState().setPendingQuestion({
            requestId: event.requestId,
            questions: event.questions,
          });
          break;
        case "agent_end":
          finalizeAssistantMessage();
          finalizeToolCalls();
          useSessionStore.getState().finalizePendingImages();
          useSessionStore.getState().clearPendingQuestion();
          setStreaming(false);
          // Refresh session list to update lastMessage preview
          refreshSessions();
          refreshRunningSessions();
          // Refresh session skills — Pi may have created new skills during this turn
          {
            const sid = useSessionStore.getState().sessionId;
            if (sid) {
              api.skills.listSession(sid)
                .then((skills) => useSkillsStore.getState().setSessionSkills(skills))
                .catch(console.error);
            }
          }
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
        case "session_info": {
          useSessionStore.getState().setSandboxActive(event.sandboxActive);
          if (event.thinkingLevel) {
            useSessionStore.getState().setThinkingLevel(event.thinkingLevel as "none" | "low" | "medium" | "high");
          }
          // Session is fully initialized — refresh files to pick up .pi/skills/ etc.
          const sid = useSessionStore.getState().sessionId;
          if (sid) {
            api.files.list(sid).then(useFilesStore.getState().setEntries).catch(console.error);
          }
          break;
        }
        case "thinking_level_changed":
          useSessionStore.getState().setThinkingLevel(event.level as "none" | "low" | "medium" | "high");
          break;
        case "files_changed": {
          const currentSessionId = useSessionStore.getState().sessionId;
          if (currentSessionId) {
            api.files.list(currentSessionId).then(useFilesStore.getState().setEntries).catch(console.error);
            // Refresh session skills when .pi/skills/ contents change
            if (event.paths.some((p: string) => p.startsWith(".pi/skills/"))) {
              api.skills.listSession(currentSessionId)
                .then((skills) => useSkillsStore.getState().setSessionSkills(skills))
                .catch(console.error);
            }
          }
          if (useSessionStore.getState().isStreaming) {
            useSessionStore.getState().addPendingImages(event.paths);
          }
          break;
        }
        case "subagent_start":
          useSessionStore.getState().startSubagent(event.subagentId, event.name, event.task, event.activeTools);
          break;
        case "subagent_tool_start":
          useSessionStore.getState().addSubagentToolStart(event.subagentId, event.tool, event.args);
          break;
        case "subagent_tool_end":
          useSessionStore.getState().completeSubagentToolCall(event.subagentId, event.tool, event.result, event.isError);
          break;
        case "subagent_message_delta":
          useSessionStore.getState().appendSubagentDelta(event.subagentId, event.text);
          break;
        case "subagent_end":
          useSessionStore.getState().endSubagent(event.subagentId, event.result, event.isError);
          break;
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

  // Poll running session status so indicators update even when viewing a different session
  useEffect(() => {
    refreshRunningSessions();
    refreshSessions();
    const interval = setInterval(() => {
      refreshRunningSessions();
      refreshSessions();
    }, 3_000);
    return () => clearInterval(interval);
  }, []);

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

  // Load available skills on mount (admin + user-installed)
  useEffect(() => {
    api.skills
      .list()
      .then((skills) => useSkillsStore.getState().setSkills(skills))
      .catch(console.error);
    api.skills
      .listUser()
      .then((skills) => useSkillsStore.getState().setUserSkills(skills))
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
      // Fetch session-local skills
      api.skills.listSession(id)
        .then((skills) => useSkillsStore.getState().setSessionSkills(skills))
        .catch(console.error);
      api.sessions.get(id).then((data) => {
        if (data.messages && data.messages.length > 0) {
          const store = useSessionStore.getState();
          store.setMessages(
            data.messages.map((m) => {
              const msg: { id: string; role: typeof m.role; content: string; timestamp: number; attachedImages?: { data: string; mimeType: string }[] } = {
                id: `msg-${m.id}`,
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
              };
              // Restore user-attached images
              if (m.role === "user" && m.images) {
                try {
                  const parsed = JSON.parse(m.images);
                  if (Array.isArray(parsed) && parsed[0]?.data) {
                    msg.attachedImages = parsed;
                  }
                } catch { /* ignore */ }
              }
              return msg;
            }),
          );
          // Restore inline image groups positioned after their associated message
          const storedMessages = useSessionStore.getState().messages;
          const seqByMsgId = new Map(storedMessages.map((m) => [m.id, m.seq]));
          for (const m of data.messages) {
            // Restore Pi-generated image groups (assistant messages only;
            // user-attached images are restored via attachedImages above)
            if (m.role === "assistant" && m.images) {
              try {
                const paths = JSON.parse(m.images) as string[];
                const msgSeq = seqByMsgId.get(`msg-${m.id}`);
                if (paths.length > 0 && msgSeq !== undefined) {
                  useSessionStore.getState().addRestoredImageGroup(paths, msgSeq + 0.5);
                }
              } catch { /* ignore malformed JSON */ }
            }
            if (m.tool_calls) {
              try {
                const toolCalls = JSON.parse(m.tool_calls) as { tool: string; args: unknown; result?: unknown; isError?: boolean }[];
                const msgSeq = seqByMsgId.get(`msg-${m.id}`);
                if (toolCalls.length > 0 && msgSeq !== undefined) {
                  useSessionStore.getState().addRestoredToolGroup(toolCalls, msgSeq - 0.5);
                }
              } catch { /* ignore malformed JSON */ }
            }
          }
        } else {
          // Empty session — mark history as loaded so rebind tool calls can render
          useSessionStore.getState().setHistoryLoaded(true);
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

  const handleStarSession = useCallback((id: string, starred: boolean) => {
    api.sessions.star(id, starred).then(() => refreshSessions()).catch((err) => setError(err.message));
  }, [setError]);

  const handleSendMessage = useCallback(
    (text: string, images?: { data: string; mimeType: string }[]) => {
      if (!text.trim() && !images?.length) return;
      useSessionStore.getState().addUserMessage(text, images);
      send({ type: "prompt", message: text, ...(images?.length ? { images } : {}) });
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
    useSessionStore.getState().setCompacting(true);
    send({ type: "compact" });
  }, [send]);

  const handleSetThinkingLevel = useCallback(
    (level: "none" | "low" | "medium" | "high") => {
      useSessionStore.getState().setThinkingLevel(level);
      send({ type: "set_thinking_level", level });
    },
    [send],
  );

  const handleAnswerQuestion = useCallback(
    (requestId: string, answers: AskUserAnswer[]) => {
      useSessionStore.getState().clearPendingQuestion();
      send({ type: "ask_user_response", requestId, answers });
    },
    [send],
  );

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
        onStarSession={handleStarSession}
        onAnswerQuestion={handleAnswerQuestion}
        onSetThinkingLevel={handleSetThinkingLevel}
      />
    </>
  );
}
