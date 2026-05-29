import { useEffect, useRef, useState } from "react";
import { Sparkles, Minus, X } from "lucide-react";
import clsx from "clsx";
import { usePiAgentContext } from "../context/PiAgentContext";
import { AgentChat } from "./AgentChat";

const PANEL_STATE_KEY = "portfolio-agent-panel";

type PanelState = "minimized" | "expanded";

function loadPanelState(): PanelState {
  const raw = localStorage.getItem(PANEL_STATE_KEY);
  return raw === "minimized" ? "minimized" : "expanded";
}

type AgentFloatingPanelProps = {
  spotlightActive?: boolean;
};

export function AgentFloatingPanel({ spotlightActive = false }: AgentFloatingPanelProps) {
  const { connected, status, agentInfo } = usePiAgentContext();
  const [panelState, setPanelState] = useState<PanelState>(loadPanelState);
  const savedPanelStateRef = useRef<PanelState | null>(null);

  useEffect(() => {
    localStorage.setItem(PANEL_STATE_KEY, panelState);
  }, [panelState]);

  useEffect(() => {
    if (spotlightActive) {
      if (savedPanelStateRef.current === null) {
        savedPanelStateRef.current = panelState;
      }
      if (panelState === "expanded") {
        setPanelState("minimized");
      }
      return;
    }

    if (savedPanelStateRef.current !== null) {
      setPanelState(savedPanelStateRef.current);
      savedPanelStateRef.current = null;
    }
  }, [spotlightActive, panelState]);

  if (panelState === "minimized") {
    return (
      <button
        type="button"
        onClick={() => setPanelState("expanded")}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-surface shadow-lg shadow-black/40 transition-transform hover:scale-105 hover:border-accent"
        title="Open AI assistant"
        data-ui-chrome="agent"
      >
        <Sparkles className="h-6 w-6 text-accent" />
        {connected && (
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-profit ring-2 ring-surface" />
        )}
      </button>
    );
  }

  return (
    <div
      className={clsx(
        "fixed bottom-6 right-6 z-40 flex w-[min(420px,calc(100vw-2rem))] flex-col",
        "rounded-xl border border-surface-border bg-surface/95 shadow-2xl shadow-black/50 backdrop-blur-xl",
        spotlightActive && "pointer-events-none opacity-40",
      )}
      style={{ height: "min(560px, calc(100vh - 3rem))" }}
      data-ui-chrome="agent"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-surface-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-gray-100">AI Assistant</h2>
          <p className="truncate text-xs text-gray-500">
            {connected ? status : "Connecting…"}
            {agentInfo?.sessionId ? ` · ${agentInfo.sessionId.slice(0, 8)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setPanelState("minimized")}
            className="btn-ghost p-2"
            title="Minimize"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPanelState("minimized")}
            className="btn-ghost p-2"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        <AgentChat compact />
      </div>
    </div>
  );
}
