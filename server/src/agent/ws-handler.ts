import fs from "node:fs";
import path from "node:path";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { createPortfolioTools, PORTFOLIO_SYSTEM_PROMPT } from "./portfolio-tools";

export type ClientMessage =
  | { type: "context"; context: unknown }
  | { type: "prompt"; text: string; context?: unknown }
  | { type: "abort" };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
};

type ServerWs = {
  send: (data: string) => void;
  close: () => void;
};

export interface AgentConnection {
  session: AgentSession;
  unsubscribe: () => void;
  currentAppContext: unknown;
}

function send(ws: ServerWs, payload: unknown) {
  ws.send(JSON.stringify(payload));
}

export function getClientId(url: string): string {
  const parsed = new URL(url, "http://localhost");
  return (
    (parsed.searchParams.get("clientId") ?? "default")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 80) || "default"
  );
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

const VISIBLE_TOOL_RESULTS = new Set([
  "navigate_app",
  "spotlight_ui",
  "propose_portfolio_trades",
]);

function chatRole(message: Record<string, unknown>): ChatMessage["role"] {
  const raw = message.role;
  if (raw === "user") return "user";
  if (raw === "assistant") return "assistant";
  if (raw === "tool" || raw === "toolResult") return "tool";
  return "system";
}

export function toChatMessages(messages: unknown[]): ChatMessage[] {
  return messages.flatMap((message, index) => {
    if (!message || typeof message !== "object" || !("role" in message)) return [];
    const record = message as Record<string, unknown>;

    if (record.role === "toolResult") {
      const toolName = typeof record.toolName === "string" ? record.toolName : "";
      if (!VISIBLE_TOOL_RESULTS.has(toolName)) return [];
    }

    const role = chatRole(record);
    const text = textFromContent("content" in record ? record.content : undefined).trim();
    if (!text) return [];
    return [{ id: `history-${index}`, role, text } satisfies ChatMessage];
  });
}

export async function createAgentConnection(ws: ServerWs, clientId: string): Promise<AgentConnection> {
  const cwd = process.cwd();
  const sessionDir = path.join(cwd, ".portfolio-manager", "sessions", clientId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const connection: AgentConnection = {
    session: null as unknown as AgentSession,
    unsubscribe: () => {},
    currentAppContext: {
      page: "assistant",
      route: "/assistant",
      note: "No app context sent by the browser yet.",
    },
  };

  const authStorage = AuthStorage.create();
  if (process.env.ANTHROPIC_API_KEY) {
    authStorage.setRuntimeApiKey("anthropic", process.env.ANTHROPIC_API_KEY);
  }
  if (process.env.OPENAI_API_KEY) {
    authStorage.setRuntimeApiKey("openai", process.env.OPENAI_API_KEY);
  }

  const modelRegistry = ModelRegistry.create(authStorage);
  const sessionManager = SessionManager.continueRecent(cwd, sessionDir);
  const { tools, toolNames } = createPortfolioTools(
    () => connection.currentAppContext,
    clientId,
    (payload) => send(ws, payload),
  );

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 2 },
    }),
    systemPromptOverride: () => PORTFOLIO_SYSTEM_PROMPT,
    appendSystemPromptOverride: () => [],
  });
  await loader.reload();

  const result = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    sessionManager,
    resourceLoader: loader,
    tools: [...toolNames],
    customTools: tools,
  });

  connection.session = result.session;
  connection.unsubscribe = connection.session.subscribe((event) => {
    send(ws, { type: "event", event });
    if (event.type === "agent_end") {
      send(ws, { type: "history", messages: toChatMessages(connection.session.messages) });
    }
  });

  send(ws, {
    type: "ready",
    sessionId: connection.session.sessionId,
    model: connection.session.model
      ? `${connection.session.model.provider}/${connection.session.model.id}`
      : undefined,
    clientId,
    tools: [...toolNames],
  });
  send(ws, { type: "history", messages: toChatMessages(connection.session.messages) });

  return connection;
}

export async function handleClientMessage(
  connection: AgentConnection,
  raw: string,
) {
  const message = JSON.parse(raw) as ClientMessage;
  const { session } = connection;

  if (message.type === "context") {
    connection.currentAppContext = message.context;
  } else if (message.type === "prompt") {
    if ("context" in message) connection.currentAppContext = message.context;
    await session.prompt(message.text, {
      streamingBehavior: session.isStreaming ? "followUp" : undefined,
    });
  } else if (message.type === "abort") {
    await session.abort();
  }
}

export function disposeAgentConnection(connection: AgentConnection) {
  connection.unsubscribe();
  connection.session.dispose();
}
