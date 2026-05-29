import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { usePiAgent, type UsePiAgentResult } from "../hooks/usePiAgent";
import { resolveSpotlight, type SpotlightRequest } from "../lib/resolve-spotlight";
import { captureUiSnapshot } from "../lib/ui-snapshot";
import { clearSpotlight, showSpotlight, waitForElement } from "../lib/spotlight";
import { AgentFloatingPanel } from "../components/AgentFloatingPanel";

const PiAgentContext = createContext<UsePiAgentResult | null>(null);

export type SpotlightUiPayload = SpotlightRequest;

export function PiAgentProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [spotlightActive, setSpotlightActive] = useState(false);

  const onNavigate = useCallback(
    (route: string) => {
      navigate(route);
    },
    [navigate],
  );

  const onSpotlight = useCallback(
    async (payload: SpotlightUiPayload) => {
      if (payload.route && window.location.pathname !== payload.route) {
        navigate(payload.route);
        await new Promise((r) => setTimeout(r, 350));
      }

      let snapshot = captureUiSnapshot(window.location.pathname);
      let resolved = resolveSpotlight(payload, snapshot);
      if (!resolved) return;

      let el = await waitForElement(resolved.selector, 2500);
      if (!el) {
        snapshot = captureUiSnapshot(window.location.pathname);
        resolved = resolveSpotlight(payload, snapshot);
        if (!resolved) return;
        el = await waitForElement(resolved.selector, 2500);
        if (!el) return;
      }

      showSpotlight(
        {
          selector: resolved.selector,
          title: resolved.title,
          message: resolved.message ?? payload.message,
        },
        {
          onStart: () => setSpotlightActive(true),
          onEnd: () => setSpotlightActive(false),
        },
      );
    },
    [navigate],
  );

  const agent = usePiAgent({ onNavigate, onSpotlight });

  useEffect(() => {
    return () => clearSpotlight();
  }, []);

  const value = useMemo(() => agent, [agent]);

  return (
    <PiAgentContext.Provider value={value}>
      {children}
      <AgentFloatingPanel spotlightActive={spotlightActive} />
    </PiAgentContext.Provider>
  );
}

export function usePiAgentContext(): UsePiAgentResult {
  const ctx = useContext(PiAgentContext);
  if (!ctx) {
    throw new Error("usePiAgentContext must be used within PiAgentProvider");
  }
  return ctx;
}
