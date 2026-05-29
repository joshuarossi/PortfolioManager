import { useCallback, useEffect, useRef, useState } from "react";
import { api, type MarketQuote } from "../lib/api";

const STABLES = new Set(["USD", "USDC", "USDT", "UST", "DAI"]);

export type TickerEntry = {
  symbol: string;
  price: number;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  change: "up" | "down" | "flat";
};

function sortSymbols(byCurrency: Record<string, { balance: number; usdValue: number }>): string[] {
  return Object.entries(byCurrency)
    .filter(([sym, { balance }]) => !STABLES.has(sym) && balance > 1e-10)
    .sort((a, b) => b[1].usdValue - a[1].usdValue)
    .map(([sym]) => sym);
}

function applyQuote(entry: TickerEntry, quote?: MarketQuote): TickerEntry {
  if (!quote) return entry;
  return {
    ...entry,
    price: quote.last,
    bid: quote.bid > 0 ? quote.bid : null,
    ask: quote.ask > 0 ? quote.ask : null,
    volume: quote.volume > 0 ? quote.volume : null,
  };
}

export function usePriceTicker() {
  const [entries, setEntries] = useState<TickerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const symbolsRef = useRef<string[]>([]);
  const prevPricesRef = useRef<Record<string, number>>({});

  const buildEntries = useCallback(
    (prices: Record<string, number>, quotes: Record<string, MarketQuote>) => {
      const symbols = symbolsRef.current;
      if (symbols.length === 0) return;

      const next: TickerEntry[] = [];
      for (const symbol of symbols) {
        const quote = quotes[symbol];
        const price = quote?.last ?? prices[symbol];
        if (price == null || price <= 0) continue;

        const prev = prevPricesRef.current[symbol];
        let change: TickerEntry["change"] = "flat";
        if (prev != null) {
          if (price > prev) change = "up";
          else if (price < prev) change = "down";
        }
        prevPricesRef.current[symbol] = price;

        next.push(
          applyQuote({ symbol, price, bid: null, ask: null, volume: null, change }, quote),
        );
      }

      if (next.length > 0) setEntries(next);
    },
    [],
  );

  const loadHoldings = useCallback(async () => {
    const portfolio = await api.getPortfolio();
    const symbols = sortSymbols(portfolio.byCurrency);
    symbolsRef.current = symbols;

    if (symbols.length === 0) {
      setEntries([]);
      return;
    }

    const market = await api.getMarketPrices(symbols);
    buildEntries(market.prices, market.quotes);
  }, [buildEntries]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await loadHoldings();
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
        const msg = JSON.parse(ev.data) as {
          type?: string;
          prices?: Record<string, number>;
          quotes?: Record<string, MarketQuote>;
        };
        if (msg.type === "prices" && msg.prices) {
          buildEntries(msg.prices, msg.quotes ?? {});
        }
        if (msg.type === "portfolio") {
          void loadHoldings().catch(console.error);
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => ws.close();

    return () => {
      cancelled = true;
      ws.close();
    };
  }, [buildEntries, loadHoldings]);

  return { entries, loading };
}
