import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PortfolioSummary } from "../lib/api";

const REFRESH_THROTTLE_MS = 1_000;

export function useLivePortfolio(options?: { loadHistory?: boolean }) {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const p = await api.getPortfolio();
    setPortfolio(p);
    return p;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await refresh();
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/market/ws`);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string };
        if (msg.type !== "prices" && msg.type !== "portfolio") return;
        if (msg.type === "portfolio") {
          void refresh().catch(console.error);
          return;
        }
        if (throttleRef.current) return;
        throttleRef.current = setTimeout(() => {
          throttleRef.current = null;
          void refresh().catch(console.error);
        }, REFRESH_THROTTLE_MS);
      } catch {
        // ignore
      }
    };

    ws.onerror = () => ws.close();

    return () => {
      cancelled = true;
      ws.close();
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, [refresh, options?.loadHistory]);

  return { portfolio, loading, refresh, setPortfolio };
}
