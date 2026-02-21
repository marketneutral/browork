import { useEffect, useRef, useCallback, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface UseWebSocketOptions {
  url: string;
  onMessage: (data: any) => void;
  enabled?: boolean;
}

/**
 * Custom WebSocket hook with reconnection and exponential backoff.
 * ~100 lines, no external dependencies, React 19 compatible.
 */
export function useWebSocket({
  url,
  onMessage,
  enabled = true,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onMessageRef = useRef(onMessage);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  // Keep callback ref fresh without re-triggering effect
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(url);

    ws.onopen = () => {
      retryCountRef.current = 0;
      setStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;

      if (!enabled) return;

      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      const delay = Math.min(1000 * 2 ** retryCountRef.current, 30000);
      retryCountRef.current++;
      retryTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [url, enabled]);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => {
      clearTimeout(retryTimeoutRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, enabled]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, status };
}
