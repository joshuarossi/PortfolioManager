import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, AlertTriangle, TrendingUp, Shield, Square } from "lucide-react";
import { api, type AiInsight, type TradeExecutionResult } from "../lib/api";
import { usePiAgent } from "../hooks/usePiAgent";
import { Badge, LoadingSpinner } from "../components/ui";
import { TradeProposalCard } from "../components/TradeProposalCard";
import { AgentThinkingIndicator } from "../components/AgentThinkingIndicator";
import { ChatMessageItem } from "../components/ChatMessageItem";
import clsx from "clsx";

const SUGGESTIONS = [
  "Analyze and optimize my portfolio",
  "Propose trades to rebalance my holdings",
  "What are my biggest risk exposures?",
  "Give me a portfolio summary",
];

const insightIcons: Record<string, React.ReactNode> = {
  concentration: <AlertTriangle className="h-4 w-4" />,
  rebalance: <TrendingUp className="h-4 w-4" />,
  diversification: <Shield className="h-4 w-4" />,
  action: <AlertTriangle className="h-4 w-4" />,
  info: <Sparkles className="h-4 w-4" />,
};

export default function AssistantPage() {
  const {
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
  } = usePiAgent();
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number>(0);

  useEffect(() => {
    api.getInsights().then(setInsights).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;

    cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: isStreaming ? "instant" : "smooth",
      });
    });
  }, [messages, activity, pendingProposal, isStreaming]);

  const streamingMessage = streamingMessageId
    ? messages.find((m) => m.id === streamingMessageId)
    : null;
  const showThinking =
    isStreaming &&
    (activity != null ||
      !streamingMessage?.text ||
      streamingMessage.text.trim().length === 0);

  const handleSend = (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || isStreaming) return;
    sendPrompt(value);
    setInput("");
  };

  const handleExecuted = (results: TradeExecutionResult[]) => {
    const ok = results.filter((r) => r.success).length;
    const fail = results.length - ok;
    sendPrompt(
      `I approved the trade proposal. Results: ${ok} succeeded${fail ? `, ${fail} failed` : ""}. Summarize what changed.`,
    );
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-100">AI Assistant</h2>
        <p className="mt-1 text-sm text-gray-500">
          {connected ? status : "Connecting to pi agent…"}
          {agentInfo?.sessionId ? ` · session ${agentInfo.sessionId.slice(0, 8)}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2 flex h-[min(720px,calc(100vh-8rem))] min-h-[480px] flex-col">
          {pendingProposal && (
            <div className="mb-4 shrink-0">
              <TradeProposalCard
                proposal={pendingProposal}
                clientId={clientId}
                onDismiss={dismissProposal}
                onExecuted={handleExecuted}
              />
            </div>
          )}

          <div
            ref={messagesRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-4 pr-1"
          >
            {messages.length === 0 && !pendingProposal && !isStreaming && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15">
                  <Sparkles className="h-7 w-7 text-accent" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-200">Portfolio AI Assistant</h3>
                <p className="mt-2 max-w-md text-sm text-gray-500">
                  Analyze your portfolio, propose optimizations, and execute Bitfinex trades after
                  your approval.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      disabled={!connected || isStreaming}
                      className="rounded-full border border-surface-border bg-surface px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-accent/50 hover:text-gray-200 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessageItem
                key={msg.id}
                message={msg}
                isLiveStream={isStreaming && msg.id === streamingMessageId}
              />
            ))}

            {showThinking && (
              <AgentThinkingIndicator label={activity ?? "Thinking"} />
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="mt-4 flex shrink-0 gap-2 border-t border-surface-border pt-4"
          >
            <input
              className="input flex-1"
              placeholder={
                isStreaming
                  ? "Agent is responding…"
                  : connected
                    ? "Ask to analyze or optimize…"
                    : "Waiting for connection…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!connected || isStreaming}
            />
            {isStreaming && (
              <button
                type="button"
                onClick={abort}
                className="btn-secondary border-loss/40 text-loss hover:bg-loss/10"
                title="Stop generating"
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            )}
            <button
              type="submit"
              disabled={!connected || !input.trim() || isStreaming}
              className="btn-primary"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="card border-accent/20 bg-accent/5">
            <h3 className="mb-2 text-sm font-medium text-gray-200">Trading</h3>
            <p className="text-xs text-gray-500">
              Bitfinex only. The AI analyzes your portfolio and proposes orders — nothing executes
              until you click <strong className="text-gray-400">Approve & Execute</strong>.
            </p>
          </div>

          <div className="card">
            <h3 className="mb-3 text-sm font-medium text-gray-300">Live Insights</h3>
            {insights.length === 0 ? (
              <p className="text-sm text-gray-500">Sync your portfolio to generate insights.</p>
            ) : (
              <div className="space-y-3">
                {insights.map((insight, i) => (
                  <div key={i} className="rounded-lg border border-surface-border bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          insight.severity === "high" && "text-loss",
                          insight.severity === "medium" && "text-yellow-400",
                          insight.severity === "low" && "text-accent",
                        )}
                      >
                        {insightIcons[insight.type] ?? <Sparkles className="h-4 w-4" />}
                      </span>
                      <span className="text-sm font-medium text-gray-200">{insight.title}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500">{insight.description}</p>
                    {insight.suggestion && (
                      <p className="mt-2 text-xs text-accent-hover">{insight.suggestion}</p>
                    )}
                    <div className="mt-2">
                      <Badge
                        variant={
                          insight.severity === "high"
                            ? "danger"
                            : insight.severity === "medium"
                              ? "warning"
                              : "default"
                        }
                      >
                        {insight.type}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="mb-2 text-sm font-medium text-gray-300">Agent Tools</h3>
            <ul className="space-y-1 text-xs text-gray-500">
              {(agentInfo?.tools ?? []).map((tool) => (
                <li key={tool}>• {tool}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
