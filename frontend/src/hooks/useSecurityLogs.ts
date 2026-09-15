import { useCallback, useEffect, useRef, useState } from "react";
import { buildBackendWebSocketUrl } from "../services/api";
import { getAccessToken, onAuthStorageChange } from "../services/auth";
import { authedFetchJson } from "../services/authenticatedFetch";
import { MAX_LOGS, TIME_RANGES, mapSecurityLog, mergeSecurityLogs, type LogEvent, type TimeRange } from "../lib/securityLogs";

export type LogConnectionState = "idle" | "connecting" | "live" | "reconnecting" | "error";

export function useSecurityLogs(timeRange: TimeRange) {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [connection, setConnection] = useState<LogConnectionState>("idle");
  const [streaming, setStreaming] = useState(true);
  const [revision, setRevision] = useState(0);
  const [token, setToken] = useState(getAccessToken);
  const streamingRef = useRef(streaming);

  useEffect(() => onAuthStorageChange(() => setToken(getAccessToken())), []);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  const toggleStreaming = useCallback(() => {
    const next = !streamingRef.current;
    streamingRef.current = next;
    setStreaming(next);
    // Reload on resume to recover events dropped while paused.
    if (next) retry();
  }, [retry]);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let watchdogTimer: number | undefined;
    let attempts = 0;
    let snapshotRequest = 0;
    const controllers = new Set<AbortController>();
    const highlights = new Map<string, number>();
    const duringSnapshot = new Map<string, LogEvent>();
    let fetchingSnapshot = false;

    setLogs([]);
    setLoading(true);
    setError(null);
    setStreamError(null);
    setConnection("idle");

    async function loadSnapshot(initial = false): Promise<boolean> {
      const request = ++snapshotRequest;
      const controller = new AbortController();
      controllers.add(controller);
      fetchingSnapshot = true;
      duringSnapshot.clear();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const params = new URLSearchParams({
          limit: String(MAX_LOGS),
          offset: "0",
          start_time: new Date(Date.now() - TIME_RANGES[timeRange]).toISOString(),
        });
        const data = await authedFetchJson<unknown>(
          `/api/v1/logs?${params}`,
          { signal: controller.signal },
          { redirectOnNetworkError: false },
        );
        if (disposed || request !== snapshotRequest) return false;
        if (!Array.isArray(data)) throw new Error("The backend returned an invalid log list.");
        const rows = data.map((item) => mapSecurityLog(item));
        if (initial || streamingRef.current) {
          setLogs(mergeSecurityLogs(rows, [...duringSnapshot.values()]));
        }
        setError(null);
        return true;
      } catch (cause) {
        if (!disposed && request === snapshotRequest) {
          setError(cause instanceof Error ? cause.message : "Unable to load security logs.");
        }
        return false;
      } finally {
        window.clearTimeout(timeout);
        controllers.delete(controller);
        if (request === snapshotRequest) {
          fetchingSnapshot = false;
          duringSnapshot.clear();
          if (!disposed) setLoading(false);
        }
      }
    }

    function scheduleReconnect() {
      if (disposed) return;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5));
      setConnection("reconnecting");
      setStreamError(`Live connection lost. Reconnecting in ${delay / 1000} seconds.`);
      reconnectTimer = window.setTimeout(connect, delay);
    }

    function connect() {
      if (disposed) return;
      const accessToken = getAccessToken();
      if (!accessToken) {
        setConnection("error");
        setStreamError("Sign in again to reconnect the live stream.");
        return;
      }
      setConnection(attempts ? "reconnecting" : "connecting");
      let ws: WebSocket;
      try {
        ws = new WebSocket(buildBackendWebSocketUrl("/ws/logs", { token: accessToken }));
      } catch {
        scheduleReconnect();
        return;
      }
      socket = ws;
      let lastMessage = Date.now();
      // Detect stalled handshakes and broken connections even without a close event.
      watchdogTimer = window.setInterval(() => {
        const deadline = ws.readyState === WebSocket.CONNECTING ? 15000 : 45000;
        if (Date.now() - lastMessage > deadline) ws.close();
      }, 5000);

      ws.onopen = () => {
        if (disposed || socket !== ws) return;
        lastMessage = Date.now();
        setConnection("live");
        setStreamError(null);
        // Catch events between the GET and handshake, and across reconnects.
        if (streamingRef.current) void loadSnapshot();
      };
      ws.onmessage = (event) => {
        if (disposed || socket !== ws) return;
        lastMessage = Date.now();
        attempts = 0;
        try {
          const payload: unknown = JSON.parse(String(event.data));
          if (payload && typeof payload === "object" && "type" in payload && payload.type === "ping") return;
          if (!streamingRef.current) return;
          const log = mapSecurityLog(payload, true);
          if (fetchingSnapshot) duringSnapshot.set(log.id, log);
          setLogs((current) => mergeSecurityLogs(current, [log]));
          setStreamError(null);
          const previous = highlights.get(log.id);
          if (previous !== undefined) window.clearTimeout(previous);
          highlights.set(log.id, window.setTimeout(() => {
            highlights.delete(log.id);
            const pending = duringSnapshot.get(log.id);
            if (pending) duringSnapshot.set(log.id, { ...pending, isNew: false });
            if (!disposed) setLogs((current) => current.map((item) => item.id === log.id ? { ...item, isNew: false } : item));
          }, 3000));
        } catch {
          setStreamError("A live log could not be read. Retry to reload stored logs.");
        }
      };
      ws.onerror = () => {
        if (disposed || socket !== ws) return;
        setStreamError("Unable to connect to the live log stream.");
        ws.close();
      };
      ws.onclose = (event) => {
        if (disposed || socket !== ws) return;
        socket = null;
        window.clearInterval(watchdogTimer);
        if (event.code === 1008) {
          setConnection("error");
          setStreamError("Live stream authentication failed. Retry to refresh your session.");
          return;
        }
        scheduleReconnect();
      };
    }

    void loadSnapshot(true).then((success) => {
      if (success && !disposed) connect();
    });

    return () => {
      disposed = true;
      controllers.forEach((controller) => controller.abort());
      window.clearTimeout(reconnectTimer);
      window.clearInterval(watchdogTimer);
      highlights.forEach((timer) => window.clearTimeout(timer));
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, [timeRange, revision, token]);

  return { logs, loading, error, streamError, connection, streaming, toggleStreaming, retry };
}
