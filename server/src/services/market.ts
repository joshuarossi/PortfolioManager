import { fetchTickers } from "./bitfinex";
import { fetchAllMids } from "./hyperliquid";
import {
  getMarketSnapshot,
  getStreamedPrices,
  getStreamedQuotes,
  watchSymbols,
  type MarketQuote,
} from "./market-stream";
import { fetchTickerQuotes } from "./bitfinex";

async function fetchMergedPrices(symbols: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(symbols.filter((s) => s && s !== "USD"))];
  const [bitfinex, hyperliquid] = await Promise.all([
    fetchTickers(unique),
    fetchAllMids(),
  ]);

  const merged = new Map<string, number>();
  for (const symbol of unique) {
    const price = bitfinex.get(symbol) ?? hyperliquid.get(symbol) ?? 0;
    if (price > 0) merged.set(symbol, price);
  }

  merged.set("USD", 1);
  merged.set("USDC", 1);
  merged.set("USDT", 1);
  merged.set("UST", 1);
  merged.set("DAI", 1);

  return merged;
}

export interface MarketPricesResult {
  prices: Record<string, number>;
  quotes: Record<string, MarketQuote>;
  fetchedAt: string;
  symbols: string[];
  source: "websocket" | "rest";
}

export async function getMarketPrices(symbols?: string[]): Promise<MarketPricesResult> {
  const requested = symbols?.length
    ? [...new Set(symbols.map((s) => s.toUpperCase()))]
    : ["BTC", "ETH", "SOL", "USD"];

  watchSymbols(requested);

  const streamed = getStreamedPrices();
  const streamedQuotes = getStreamedQuotes();
  const snapshot = getMarketSnapshot();
  const missing = requested.filter((s) => {
    if (s === "USD" || s === "USDC" || s === "USDT" || s === "UST" || s === "DAI") return false;
    const px = streamed.get(s);
    return px == null || px <= 0;
  });

  let priceMap = streamed;
  let quoteMap = streamedQuotes;
  let fetchedAt = snapshot.fetchedAt;
  let source: "websocket" | "rest" = "websocket";

  if (missing.length > 0) {
    const [restPrices, restQuotes] = await Promise.all([
      fetchMergedPrices(missing),
      fetchTickerQuotes(missing),
    ]);
    priceMap = new Map(streamed);
    quoteMap = new Map(streamedQuotes);
    for (const [k, v] of restPrices) priceMap.set(k, v);
    for (const [k, v] of restQuotes) quoteMap.set(k, v);
    fetchedAt = new Date().toISOString();
    source = "rest";
  }

  const prices: Record<string, number> = {};
  const quotes: Record<string, MarketQuote> = {};
  for (const symbol of requested) {
    const price =
      priceMap.get(symbol) ??
      (symbol === "USD" || symbol === "USDC" || symbol === "USDT" || symbol === "UST" || symbol === "DAI"
        ? 1
        : 0);
    if (price > 0) {
      prices[symbol] = price;
      const q = quoteMap.get(symbol);
      quotes[symbol] = q ?? { last: price, bid: price, ask: price, volume: 0 };
    }
  }

  return {
    prices,
    quotes,
    fetchedAt,
    symbols: Object.keys(prices),
    source,
  };
}

export function applyLivePrices<T extends { currency: string; balance: number; usdValue: number }>(
  wallets: T[],
  prices: Record<string, number>,
): T[] {
  return wallets.map((w) => {
    const price =
      prices[w.currency] ??
      (w.currency === "USD" || w.currency === "USDC" || w.currency === "USDT" ? 1 : null);
    if (price == null || price <= 0) return w;
    return { ...w, usdValue: w.balance * price };
  });
}
