import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { TradeProposalPayload } from "../lib/api";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
};

export type AgentInfo = {
  sessionId: string;
  model?: string;
  clientId?: string;
  tools?: string[];
};

type ServerMessage =
  | ({ type: "ready" } & AgentInfo)
  | { type: "history"; messages: ChatMessage[] }
  | { type: "trade_proposal"; proposal: TradeProposalPayload }
  | {
      type: "event";
      event: {
        type: string;
        assistantMessageEvent?: { type: string; delta?: string };
        toolName?: string;
      };
    }
  | { type: "error"; message: string };

const CLIENT_ID_KEY = "portfolio-manager-client-id";

function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `user_${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function buildAppContext(pathname: string) {
  return {
    page: pathname === "/" ? "dashboard" : pathname.replace(/^\//, ""),
    route: pathname,
    app: "Portfolio Manager",
    capabilities: {
      exchanges: ["bitfinex", "hyperliquid"],
      trading: { bitfinex: true, hyperliquid: false, requiresApproval: true },
      assistantTools: [
        "get_portfolio_summary",
        "get_portfolio_insights",
        "get_connected_exchanges",
        "get_current_app_context",
        "propose_portfolio_trades",
      ],
    },
  };
}

export function usePiAgent() {
  const location = useLocation();
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Connecting…");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [pendingProposal, setPendingProposal] = useState<TradeProposalPayload | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const modelRef = useRef<string | undefined>(undefined);
  const clientId = useMemo(() => getClientId(), []);

  const wsUrl = useMemo(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/agent?clientId=${encodeURIComponent(clientId)}`;
  }, [clientId]);

  const sendContext = useCallback(
    (ws: WebSocket) => {
      ws.send(
        JSON.stringify({
          type: "context",
          context: buildAppContext(location.pathname),
        }),
      );
    },
    [location.pathname],
  );

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("Starting pi session…");
      sendContext(ws);
    };

    ws.onclose = () => {
      setConnected(false);
      setStatus("Disconnected");
      setActivity(null);
      setIsStreaming(false);
      setStreamingMessageId(null);
    };

    ws.onerror = () => setStatus("WebSocket error");

    ws.onmessage = (raw) => {
      const message = JSON.parse(raw.data) as ServerMessage;

      if (message.type === "ready") {
        setConnected(true);
        setAgentInfo(message);
        modelRef.current = message.model;
        setStatus(`Ready${message.model ? ` · ${message.model}` : ""}`);
        return;
      }

      if (message.type === "history") {
        setMessages(message.messages);
        return;
      }

      if (message.type === "trade_proposal") {
        setPendingProposal(message.proposal);
        return;
      }

      if (message.type === "error") {
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "system", text: message.message },
        ]);
        return;
      }

      const event = message.event;
      switch (event.type) {
        case "agent_start":
          assistantIdRef.current = crypto.randomUUID();
          setIsStreaming(true);
          setStreamingMessageId(null);
          setStatus("Thinking…");
          setActivity(null);
          break;
        case "message_update":
          if (event.assistantMessageEvent?.type === "text_delta") {
            const delta = event.assistantMessageEvent.delta ?? "";
            const streamId = assistantIdRef.current ?? crypto.randomUUID();
            assistantIdRef.current = streamId;
            setStreamingMessageId(streamId);
            setMessages((current) => {
              const index = current.findIndex((m) => m.id === streamId);
              if (index === -1) {
                return [...current, { id: streamId, role: "assistant", text: delta }];
              }
              const next = [...current];
              next[index] = { ...next[index], text: next[index].text + delta };
              return next;
            });
          }
          break;
        case "tool_execution_start":
          setActivity(
            event.toolName === "get_portfolio_summary"
              ? "Loading portfolio…"
              : event.toolName === "get_portfolio_insights"
                ? "Analyzing insights…"
                : event.toolName === "propose_portfolio_trades"
                  ? "Building trade proposal…"
                  : `Running ${event.toolName ?? "tool"}…`,
          );
          setStatus("Working…");
          break;
        case "tool_execution_end":
          setActivity(null);
          break;
        case "agent_end":
          assistantIdRef.current = null;
          setIsStreaming(false);
          setStreamingMessageId(null);
          setStatus(modelRef.current ? `Ready · ${modelRef.current}` : "Ready");
          setActivity(null);
          break;
      }
    };

    return () => ws.close();
  }, [wsUrl, sendContext]);

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendContext(wsRef.current);
    }
  }, [location.pathname, sendContext]);

  const sendPrompt = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", text: trimmed },
      ]);

      wsRef.current.send(
        JSON.stringify({
          type: "prompt",
          text: trimmed,
          context: buildAppContext(location.pathname),
        }),
      );
    },
    [location.pathname],
  );

  const abort = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "abort" }));
    setIsStreaming(false);
    setStreamingMessageId(null);
    setActivity(null);
    assistantIdRef.current = null;
  }, []);

  const dismissProposal = useCallback(() => setPendingProposal(null), []);

  return {
    connected,
    status,
    messages,
    agentInfo,
    activity,
    pendingProposal,
    isStreaming,
    streamingMessageId,
    clientId,
    sendPrompt,
    abort,
    dismissProposal,
  };
}
