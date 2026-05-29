import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Send, Sparkles, Square } from "lucide-react";
import type { TradeExecutionResult } from "../lib/api";
import { usePiAgentContext } from "../context/PiAgentContext";
import { TradeProposalCard } from "./TradeProposalCard";
import { AgentThinkingIndicator } from "./AgentThinkingIndicator";
import { ChatMessageItem } from "./ChatMessageItem";

const SUGGESTIONS = [
  "Take me to add a new exchange",
  "Analyze and optimize my portfolio",
  "What are my biggest risk exposures?",
  "Give me a portfolio summary",
];

type AgentChatProps = {
  compact?: boolean;
  className?: string;
};

export function AgentChat({ compact = false, className = "" }: AgentChatProps) {
  const {
    connected,
    messages,
    activity,
    pendingProposal,
    isStreaming,
    streamingMessageId,
    clientId,
    sendPrompt,
    abort,
    dismissProposal,
  } = usePiAgentContext();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);

  const scrollToBottom = (behavior: ScrollBehavior) => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance < 48;
  };

  const streamingMessage = streamingMessageId
    ? messages.find((m) => m.id === streamingMessageId)
    : null;
  const showThinking =
    isStreaming &&
    (activity != null ||
      !streamingMessage?.text ||
      streamingMessage.text.trim().length === 0);

  useLayoutEffect(() => {
    if (!initialScrollDoneRef.current && messages.length > 0) {
      scrollToBottom("instant");
      initialScrollDoneRef.current = true;
      return;
    }

    if (atBottomRef.current || isStreaming) {
      scrollToBottom(isStreaming ? "instant" : "smooth");
    }
  }, [messages, activity, pendingProposal, isStreaming, showThinking]);

  useEffect(() => {
    if (messages.length === 0) {
      initialScrollDoneRef.current = false;
    }
  }, [messages.length]);

  const handleSend = (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || isStreaming) return;
    atBottomRef.current = true;
    sendPrompt(value);
    setInput("");
    requestAnimationFrame(() => scrollToBottom("smooth"));
  };

  const handleExecuted = (results: TradeExecutionResult[]) => {
    const ok = results.filter((r) => r.success).length;
    const fail = results.length - ok;
    atBottomRef.current = true;
    sendPrompt(
      `I approved the trade proposal. Results: ${ok} succeeded${fail ? `, ${fail} failed` : ""}. Summarize what changed.`,
    );
  };

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      {pendingProposal && (
        <div className="mb-3 shrink-0">
          <TradeProposalCard
            proposal={pendingProposal}
            clientId={clientId}
            onDismiss={dismissProposal}
            onExecuted={handleExecuted}
          />
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
      >
        <div className="flex min-h-full flex-col">
          <div className="flex-1" aria-hidden />
          {messages.length === 0 && !pendingProposal && !isStreaming && (
            <div
              className={
                compact
                  ? "shrink-0 py-4 text-center"
                  : "flex shrink-0 flex-col items-center py-8 text-center"
              }
            >
              {!compact && (
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15">
                  <Sparkles className="h-6 w-6 text-accent" />
                </div>
              )}
              <p className={compact ? "text-xs text-gray-500" : "mt-3 text-sm text-gray-500"}>
                Ask about your portfolio, trades, or say &quot;take me to exchanges&quot;.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSend(s)}
                    disabled={!connected || isStreaming}
                    className="rounded-full border border-surface-border bg-surface px-2.5 py-1 text-[11px] text-gray-400 transition-colors hover:border-accent/50 hover:text-gray-200 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="shrink-0 space-y-3">
            {messages.map((msg) => (
              <ChatMessageItem
                key={msg.id}
                message={msg}
                isLiveStream={isStreaming && msg.id === streamingMessageId}
              />
            ))}

            {showThinking && <AgentThinkingIndicator label={activity ?? "Thinking"} />}
          </div>

          <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="mt-3 flex shrink-0 gap-2 border-t border-surface-border pt-3"
      >
        <input
          className="input flex-1 text-sm"
          placeholder={
            isStreaming
              ? "Agent is responding…"
              : connected
                ? "Ask anything…"
                : "Connecting…"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!connected || isStreaming}
        />
        {isStreaming && (
          <button
            type="button"
            onClick={abort}
            className="btn-secondary border-loss/40 px-2.5 text-loss hover:bg-loss/10"
            title="Stop"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        )}
        <button
          type="submit"
          disabled={!connected || !input.trim() || isStreaming}
          className="btn-primary px-3"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
