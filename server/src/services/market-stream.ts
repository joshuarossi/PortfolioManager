import { fetchAllMids } from "./hyperliquid";

const HL_WS = "wss://api.hyperliquid.xyz/ws";
const BFX_WS = "wss://api-pub.bitfinex.com/ws/2";
const RECONNECT_MS = 5_000;
const NOTIFY_DEBOUNCE_MS = 250;

const STABLES: Record<string, number> = {
  USD: 1,
  USDC: 1,
  USDT: 1,
  UST: 1,
  DAI: 1,
};

export interface MarketQuote {
  last: number;
  bid: number;
  ask: number;
  volume: number;
}

export type MarketUpdateListener = (update: {
  prices: Record<string, number>;
  quotes: Record<string, MarketQuote>;
  fetchedAt: string;
}) => void;

type MarketClient = { send: (data: string) => void };

let priceMap = new Map<string, number>(Object.entries(STABLES));
const quoteMap = new Map<string, MarketQuote>();
let updatedAt = new Date();
let hlWs: WebSocket | null = null;
let bfxWs: WebSocket | null = null;
const bfxChanToSymbol = new Map<number, string>();
const bfxSubscribed = new Set<string>();
const watchedSymbols = new Set<string>();
const listeners = new Set<MarketUpdateListener>();
const marketClients = new Set<MarketClient>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

function setQuote(symbol: string, bid: number, ask: number, last: number, volume: number) {
  if (last <= 0 || !Number.isFinite(last)) return;
  const key = symbol.toUpperCase();
  const prev = quoteMap.get(key);
  const next = { bid, ask, last, volume };
  const unchanged =
    prev &&
    prev.last === next.last &&
    prev.bid === next.bid &&
    prev.ask === next.ask &&
    prev.volume === next.volume;
  if (unchanged) return;
  quoteMap.set(key, next);
  priceMap.set(key, last);
  updatedAt = new Date();
  scheduleNotify();
}

function setPrice(symbol: string, price: number) {
  if (price <= 0 || !Number.isFinite(price)) return;
  const key = symbol.toUpperCase();
  const prev = priceMap.get(key);
  if (prev === price) return;
  priceMap.set(key, price);
  const q = quoteMap.get(key);
  quoteMap.set(key, { bid: q?.bid ?? price, ask: q?.ask ?? price, last: price, volume: q?.volume ?? 0 });
  updatedAt = new Date();
  scheduleNotify();
}

function scheduleNotify() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    const snapshot = getMarketSnapshot();
    const payload = JSON.stringify({ type: "prices", ...snapshot });
    for (const ws of marketClients) {
      try {
        ws.send(payload);
      } catch {
        // client disconnected
      }
    }
    for (const cb of listeners) cb(snapshot);
  }, NOTIFY_DEBOUNCE_MS);
}

export function getMarketSnapshot(): {
  prices: Record<string, number>;
  quotes: Record<string, MarketQuote>;
  fetchedAt: string;
} {
  const prices: Record<string, number> = {};
  const quotes: Record<string, MarketQuote> = {};
  for (const [k, v] of priceMap) prices[k] = v;
  for (const [k, v] of quoteMap) quotes[k] = v;
  return { prices, quotes, fetchedAt: updatedAt.toISOString() };
}

export function getStreamedQuotes(): Map<string, MarketQuote> {
  return new Map(quoteMap);
}

export function getStreamedPrices(): Map<string, number> {
  return new Map(priceMap);
}

export function onMarketUpdate(listener: MarketUpdateListener): () => void {
  listeners.add(listener);
  listener(getMarketSnapshot());
  return () => listeners.delete(listener);
}

export function registerMarketClient(ws: MarketClient): () => void {
  marketClients.add(ws);
  ws.send(JSON.stringify({ type: "prices", ...getMarketSnapshot() }));
  return () => marketClients.delete(ws);
}

export function broadcastPortfolioUpdate(payload: {
  exchangeId: string;
  source: string;
  event?: string;
}) {
  const message = JSON.stringify({
    type: "portfolio",
    ...payload,
    fetchedAt: new Date().toISOString(),
  });
  for (const ws of marketClients) {
    try {
      ws.send(message);
    } catch {
      // client disconnected
    }
  }
}

export function watchSymbols(symbols: string[]) {
  for (const s of symbols) {
    const sym = s.toUpperCase();
    if (STABLES[sym] != null) continue;
    watchedSymbols.add(sym);
  }
  ensureBfxSubscriptions();
}

async function seedPrices() {
  try {
    const mids = await fetchAllMids();
    for (const [coin, px] of mids) setPrice(coin, px);
  } catch (err) {
    console.error("[market] REST seed failed:", err);
  }
}

function connectHyperliquid() {
  if (hlWs && (hlWs.readyState === WebSocket.OPEN || hlWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  hlWs = new WebSocket(HL_WS);

  hlWs.onopen = () => {
    console.log("[market] Hyperliquid WS connected");
    hlWs!.send(JSON.stringify({ method: "subscribe", subscription: { type: "allMids" } }));
  };

  hlWs.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as {
        channel?: string;
        data?: { mids?: Record<string, string> };
      };
      if (msg.channel === "allMids" && msg.data?.mids) {
        for (const [coin, pxStr] of Object.entries(msg.data.mids)) {
          setPrice(coin, parseFloat(pxStr));
        }
      }
    } catch {
      // ignore malformed frames
    }
  };

  hlWs.onclose = () => {
    console.log("[market] Hyperliquid WS closed, reconnecting...");
    hlWs = null;
    setTimeout(connectHyperliquid, RECONNECT_MS);
  };

  hlWs.onerror = () => hlWs?.close();
}

function normalizeBfxSymbol(pair: string): string {
  let s = pair.replace(/^t/i, "");
  for (const quote of ["USD", "UST", "USDT", "EUR"]) {
    if (s.endsWith(quote)) return s.slice(0, -quote.length);
  }
  return s;
}

function connectBitfinex() {
  if (bfxWs && (bfxWs.readyState === WebSocket.OPEN || bfxWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  bfxWs = new WebSocket(BFX_WS);

  bfxWs.onopen = () => {
    console.log("[market] Bitfinex WS connected");
    ensureBfxSubscriptions();
  };

  bfxWs.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as {
        event?: string;
        channel?: string;
        chanId?: number;
        symbol?: string;
      };

      if (msg.event === "subscribed" && msg.channel === "ticker" && msg.chanId != null && msg.symbol) {
        bfxChanToSymbol.set(msg.chanId, normalizeBfxSymbol(msg.symbol));
        return;
      }

      if (Array.isArray(msg)) {
        const [chanId, data] = msg as [number, number[] | "hb"];
        if (data === "hb" || !Array.isArray(data) || data.length < 8) return;
        const symbol = bfxChanToSymbol.get(chanId);
        if (symbol) setQuote(symbol, data[0], data[2], data[6], data[7]);
      }
    } catch {
      // ignore malformed frames
    }
  };

  bfxWs.onclose = () => {
    console.log("[market] Bitfinex WS closed, reconnecting...");
    bfxWs = null;
    bfxChanToSymbol.clear();
    bfxSubscribed.clear();
    setTimeout(connectBitfinex, RECONNECT_MS);
  };

  bfxWs.onerror = () => bfxWs?.close();
}

function ensureBfxSubscriptions() {
  if (!bfxWs || bfxWs.readyState !== WebSocket.OPEN) return;

  for (const symbol of watchedSymbols) {
    if (bfxSubscribed.has(symbol)) continue;
    bfxWs.send(JSON.stringify({ event: "subscribe", channel: "ticker", symbol: `t${symbol}USD` }));
    bfxSubscribed.add(symbol);
  }
}

export async function startMarketStream() {
  for (const [k, v] of Object.entries(STABLES)) priceMap.set(k, v);
  await seedPrices();
  connectHyperliquid();
  connectBitfinex();
  console.log("[market] WebSocket price stream started");
}
