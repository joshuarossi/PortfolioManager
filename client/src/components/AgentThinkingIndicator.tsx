import clsx from "clsx";

interface AgentThinkingIndicatorProps {
  label?: string;
}

export function AgentThinkingIndicator({ label = "Thinking" }: AgentThinkingIndicatorProps) {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-overlay px-4 py-3">
        <div className="relative flex h-8 w-8 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-accent/15">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-300">{label}</p>
          <div className="mt-1 flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={clsx("h-1.5 w-1.5 rounded-full bg-accent/70 animate-bounce-dot")}
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StreamingCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-cursor-blink bg-accent"
      aria-hidden
    />
  );
}
