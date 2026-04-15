import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import http from "http";
import { Server } from "socket.io";
import WebSocket from "ws";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";

function readEnv(name: string, fallback = ""): string {
  return String(process.env[name] || fallback || "").trim();
}

function requireEnv(name: string, fallback = ""): string {
  const value = readEnv(name, fallback);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseBooleanEnv(name: string, fallback = "false"): boolean {
  return (readEnv(name, fallback)?.toLowerCase() || "") === "true";
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port number");
  }
  return port;
}

function stripApiSuffix(value: string): string {
  return value.replace(/\/+$/, "").replace(/\/api(?:\/v1)?$/i, "");
}

function normalizeHttpBaseUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute http(s) URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }

  return stripApiSuffix(url.toString()).replace(/\/+$/, "");
}

// Keep the app reachable at the same origin used in verification emails.
const GATEWAY_PORT = parsePort(readEnv("PORT", readEnv("GATEWAY_PORT", "5173")));
const BACKEND_AI_URL = normalizeHttpBaseUrl(
  "BACKEND_AI_URL",
  requireEnv("BACKEND_AI_URL", readEnv("VITE_API_URL", readEnv("VITE_API_BASE_URL"))),
);
const ENABLE_LOCAL_FALLBACK = parseBooleanEnv("ENABLE_LOCAL_FALLBACK");
const ENABLE_BACKEND_WS_BRIDGE = parseBooleanEnv("ENABLE_BACKEND_WS_BRIDGE");

function runLocalSecurityScan(prompt: string) {
  const normalized = prompt?.toLowerCase() || "";
  const isObfuscated =
    /(?:%[0-9a-f]{2}){4,}/i.test(prompt) ||
    /(?:\\u[0-9a-f]{4}|\\x[0-9a-f]{2}){2,}/i.test(prompt) ||
    /\b[a-z0-9+/]{40,}={0,2}\b/i.test(prompt);
  const isInjection =
    normalized.includes("ignore previous") ||
    normalized.includes("developer mode") ||
    normalized.includes("system prompt") ||
    normalized.includes("you are now debugbot");
  const hasSensitiveData =
    normalized.includes("credit card") ||
    normalized.includes("password") ||
    normalized.includes("api key") ||
    normalized.includes("ssn") ||
    normalized.includes("eyj");
  const isMalicious =
    normalized.includes("encrypt all files") ||
    normalized.includes("ransom") ||
    normalized.includes("malware") ||
    normalized.includes("phishing") ||
    normalized.includes("os.environ") ||
    normalized.includes(".env");

  const sentinelBase = {
    provider: "gemini",
    model: "gemini-3.1-pro",
    security_tier: "PRO",
  };

  if (isObfuscated) {
    return {
      status: "BLOCKED",
      sanitized_content: "",
      sentinel_verdict: {
        ...sentinelBase,
        threat_score: 0.78,
        category: "Obfuscation",
        detail: "Hidden Obfuscation Payload",
        execution_output: "BLOCKED",
      },
      threat_level: "HIGH",
      usage_stats: {
        tokens: prompt.split(/\s+/).filter(Boolean).length,
        tier_active: "PRO",
      },
      security_report: {
        threat_type: "ENCODING_OBFUSCATION",
        detection_reason: "Encoded or obfuscated payload indicators were detected.",
        action_taken: "Blocked before model execution.",
      },
    };
  }

  if (isInjection) {
    return {
      status: "BLOCKED",
      sanitized_content: "",
      sentinel_verdict: {
        ...sentinelBase,
        threat_score: 0.98,
        category: "Injection",
        detail: normalized.includes("debugbot") ? "Instruction Hijacking via Roleplay" : "Instruction Override",
        execution_output: "BLOCKED",
      },
      threat_level: "HIGH",
      usage_stats: {
        tokens: prompt.split(/\s+/).filter(Boolean).length,
        tier_active: "PRO",
      },
      security_report: {
        threat_type: "PROMPT_INJECTION",
        detection_reason: "Prompt contains instruction-overriding patterns.",
        action_taken: "Blocked before model execution.",
      },
    };
  }

  if (hasSensitiveData) {
    return {
      status: "BLOCKED",
      sanitized_content: prompt.replace(/(credit card|password|api key|ssn)/gi, "[REDACTED_BY_SENTINEL]"),
      sentinel_verdict: {
        ...sentinelBase,
        threat_score: 0.64,
        category: "PII",
        detail: "PII or Credential Leak Attempt",
        execution_output: "BLOCKED",
      },
      threat_level: "MEDIUM",
      usage_stats: {
        tokens: prompt.split(/\s+/).filter(Boolean).length,
        tier_active: "PRO",
      },
      security_report: {
        threat_type: "DATA_LEAK",
        detection_reason: "Sensitive data indicators were detected.",
        action_taken: "Blocked before model execution.",
      },
    };
  }

  if (isMalicious) {
    return {
      status: "BLOCKED",
      sanitized_content: "",
      sentinel_verdict: {
        ...sentinelBase,
        threat_score: 0.99,
        category: "Malicious",
        detail: "Sensitive Secret Exfiltration Attempt",
        execution_output: "BLOCKED",
      },
      threat_level: "HIGH",
      usage_stats: {
        tokens: prompt.split(/\s+/).filter(Boolean).length,
        tier_active: "PRO",
      },
      security_report: {
        threat_type: "MALICIOUS_INTENT",
        detection_reason: "Prompt requests destructive or abusive behavior.",
        action_taken: "Blocked due to high-risk malicious intent.",
      },
    };
  }

  return {
    status: "CLEAN",
    sanitized_content: prompt,
    sentinel_verdict: {
      ...sentinelBase,
      threat_score: 0.02,
      category: "Clean",
      detail: "No high-confidence threat indicators were detected.",
      execution_output: "PASSTHROUGH_APPROVED",
    },
    threat_level: "LOW",
    usage_stats: {
      tokens: prompt.split(/\s+/).filter(Boolean).length,
      tier_active: "PRO",
    },
    security_report: {
      threat_type: "NONE",
      detection_reason: "No high-confidence threat indicators detected.",
      action_taken: "Prompt allowed to proceed.",
    },
  };
}

function toWsUrl(httpUrl: string) {
  return httpUrl.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
}

function emitStrategyUpdate(io: Server, log: any) {
  const status = String(log?.status || "").toUpperCase();
  if (status !== "BLOCKED" && status !== "REDACTED") return;
  io.emit("strategy_update", {
    at: new Date().toISOString(),
    status,
    threat_type: log?.threat_type || "UNKNOWN",
    recommendations: [
      "Quarantine/rotate the affected API key.",
      "Tighten validation rules for risky endpoints.",
      "Review redaction rules and alert thresholds.",
    ],
  });
}

async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  attempts = 2
): Promise<{ status: number; headers: Headers; body: any }> {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      const text = await res.text();
      const body = text ? JSON.parse(text) : null;
      return { status: res.status, headers: res.headers, body };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw lastErr;
}

function proxyStream(req: express.Request, res: express.Response) {
  const target = new URL(req.originalUrl, BACKEND_AI_URL);
  const isHttps = target.protocol === "https:";

  const headers: Record<string, any> = { ...req.headers };
  delete headers.host;
  delete headers.connection;

  const proxyReq = (isHttps ? httpsRequest : httpRequest)(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: req.method,
      path: target.pathname + target.search,
      headers,
      timeout: 15000,
    },
    (proxyRes) => {
      res.statusCode = proxyRes.statusCode || 502;
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v != null) res.setHeader(k, v as any);
      }
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("timeout", () => {
    proxyReq.destroy(new Error("upstream_timeout"));
  });
  proxyReq.on("error", (err) => {
    if (res.headersSent) return;
    res.status(502).json({
      success: false,
      data: null,
      error: { code: "bad_gateway", message: String((err as any)?.message || err) },
    });
  });

  req.pipe(proxyReq);
}

function startBackendWebSocketBridge(io: Server) {
  const wsBase = toWsUrl(BACKEND_AI_URL);

  const connect = (path: string, onJson: (data: any) => void) => {
    let stopped = false;
    let backoffMs = 500;

    const run = () => {
      if (stopped) return;
      const ws = new WebSocket(`${wsBase}${path}`);
      ws.on("open", () => {
        backoffMs = 500;
        console.log(`Backend websocket bridge connected: ${path}`);
      });
      ws.on("message", (buf: any) => {
        try {
          const raw = buf.toString("utf-8");
          const data = JSON.parse(raw);
          onJson(data);
        } catch {}
      });
      ws.on("close", () => {
        if (stopped) return;
        const delay = Math.min(8000, backoffMs);
        backoffMs = Math.min(8000, Math.floor(backoffMs * 1.7));
        console.warn(`Backend websocket bridge closed: ${path}. Retrying in ${delay}ms.`);
        setTimeout(run, delay);
      });
      ws.on("error", (error: unknown) => {
        console.warn(`Backend websocket bridge error: ${path}`, error);
        try {
          ws.close();
        } catch {}
      });
    };

    run();
    return () => {
      stopped = true;
    };
  };

  connect("/ws/logs", (log) => {
    io.emit("new_log", log);
    if (String(log?.status || "").toUpperCase() === "BLOCKED") io.emit("threat_detected", log);
    emitStrategyUpdate(io, log);
  });

  connect("/ws/notifications", (notification) => {
    io.emit("notification_received", notification);
    if (String(notification?.type || "").toUpperCase() === "REMEDIATION") {
      io.emit("remediation_triggered", notification);
    }
  });
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  app.post("/api/v1/scan", express.json({ limit: "1mb" }), async (req, res) => {
    const upstream = `${BACKEND_AI_URL}/api/v1/scan`;
    try {
      const { status, body } = await fetchJsonWithRetry(upstream, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(req.headers.authorization ? { Authorization: String(req.headers.authorization) } : {}),
          ...(req.headers["x-api-key"] ? { "x-api-key": String(req.headers["x-api-key"]) } : {}),
        },
        body: JSON.stringify(req.body || {}),
      });

      if (status >= 200 && status < 300) return res.status(status).json(body);

      if (ENABLE_LOCAL_FALLBACK && req.body?.prompt) {
        const local = runLocalSecurityScan(String(req.body.prompt));
        return res.status(200).json({ success: true, data: local, error: null });
      }

      return res.status(status).json(body);
    } catch (err: any) {
      if (ENABLE_LOCAL_FALLBACK && req.body?.prompt) {
        const local = runLocalSecurityScan(String(req.body.prompt));
        return res.status(200).json({ success: true, data: local, error: null });
      }
      return res.status(502).json({
        success: false,
        data: null,
        error: { code: "bad_gateway", message: String(err?.message || err) },
      });
    }
  });

  app.post("/api/v1/keys", express.json({ limit: "64kb" }), async (req, res) => {
    const upstream = `${BACKEND_AI_URL}/api/v1/keys`;
    const { status, body } = await fetchJsonWithRetry(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization ? { Authorization: String(req.headers.authorization) } : {}),
      },
      body: JSON.stringify(req.body || {}),
    });
    res.status(status).json(body);
    if (status >= 200 && status < 300) io.emit("keys_updated", { at: new Date().toISOString() });
  });

  app.delete("/api/v1/keys/:id", async (req, res) => {
    const upstream = `${BACKEND_AI_URL}/api/v1/keys/${encodeURIComponent(String(req.params.id))}`;
    const { status, body } = await fetchJsonWithRetry(upstream, {
      method: "DELETE",
      headers: {
        ...(req.headers.authorization ? { Authorization: String(req.headers.authorization) } : {}),
      },
    });
    res.status(status).json(body);
    if (status >= 200 && status < 300) io.emit("keys_updated", { at: new Date().toISOString() });
  });

  app.use(["/api", "/api/v1", "/brain", "/analyze", "/health"], (req, res) => proxyStream(req, res));

  if (ENABLE_BACKEND_WS_BRIDGE) {
    startBackendWebSocketBridge(io);
  } else {
    console.log("Backend websocket bridge disabled; frontend connects directly to FastAPI websockets.");
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  server.listen(GATEWAY_PORT, "0.0.0.0", () => {
    console.log(`Gateway running on http://localhost:${GATEWAY_PORT} -> ${BACKEND_AI_URL}`);
  });
}

startServer();
