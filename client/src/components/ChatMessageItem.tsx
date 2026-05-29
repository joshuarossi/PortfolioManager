import { memo, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { MarkdownMessage } from "./MarkdownMessage";
import { StreamingCursor } from "./AgentThinkingIndicator";
import { useSmoothTypewriter } from "../hooks/useSmoothTypewriter";
import type { ChatMessage } from "../hooks/usePiAgent";

interface ChatMessageItemProps {
  message: ChatMessage;
  isLiveStream: boolean;
}

export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  isLiveStream,
}: ChatMessageItemProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const hasStreamedRef = useRef(isLiveStream);

  if (isLiveStream) hasStreamedRef.current = true;

  const useTypewriter = isAssistant && (isLiveStream || hasStreamedRef.current);
  const { displayed, isCaughtUp } = useSmoothTypewriter(
    message.text,
    isLiveStream && isAssistant,
  );

  const [showMarkdown, setShowMarkdown] = useState(
    isAssistant && !isLiveStream && !hasStreamedRef.current && message.text.length > 0,
  );

  useEffect(() => {
    if (!isAssistant) return;
    if (isLiveStream) {
      setShowMarkdown(false);
      return;
    }
    if (!hasStreamedRef.current) {
      setShowMarkdown(true);
      return;
    }
    if (isCaughtUp) {
      const t = window.setTimeout(() => setShowMarkdown(true), 100);
      return () => window.clearTimeout(t);
    }
    setShowMarkdown(false);
  }, [isAssistant, isLiveStream, isCaughtUp]);

  const showPlainStream = useTypewriter && !showMarkdown;

  return (
    <div
      className={clsx(
        "flex",
        isUser ? "justify-end" : "justify-start",
        isUser && "animate-message-in",
      )}
    >
      <div
        className={clsx(
          "max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-accent text-white"
            : message.role === "system"
              ? "bg-loss/10 text-loss border border-loss/30"
              : message.role === "tool"
                ? "border border-accent/25 bg-accent/10 text-gray-300"
                : "bg-surface-overlay text-gray-200 border border-surface-border",
          showPlainStream && "border-accent/20",
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.text}</div>
        ) : message.role === "system" ? (
          <MarkdownMessage content={message.text} variant="system" />
        ) : message.role === "tool" ? (
          <MarkdownMessage content={message.text} variant="tool" />
        ) : showPlainStream ? (
          <div className="whitespace-pre-wrap break-words text-gray-200">
            {displayed}
            {(isLiveStream || !isCaughtUp) && <StreamingCursor />}
          </div>
        ) : (
          <div className="animate-markdown-in">
            <MarkdownMessage content={message.text} variant="assistant" />
          </div>
        )}
      </div>
    </div>
  );
});
