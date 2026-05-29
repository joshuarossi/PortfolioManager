import { db } from "../db";
import { exchanges } from "../db/schema";
import { decrypt } from "./crypto";
import {
  buildWsAuthMessage,
  parseBitfinexWalletRow,
  type BitfinexWallet,
} from "./bitfinex";
import { applyExchangeWallets } from "./portfolio";
import { broadcastPortfolioUpdate, watchSymbols } from "./market-stream";
import { eq, and } from "drizzle-orm";

const BFX_AUTH_WS = "wss://api.bitfinex.com/ws/2";
const RECONNECT_MS = 5_000;
const APPLY_DEBOUNCE_MS = 500;

function walletKey(w: Pick<BitfinexWallet, "type" | "currency">) {
  return `${w.type}:${w.currency}`;
}

type Connection = {
  exchangeId: string;
  ws: WebSocket;
  walletCache: Map<string, BitfinexWallet>;
  applyTimer: ReturnType<typeof setTimeout> | null;
  authenticated: boolean;
  authSent: boolean;
  apiKey: string;
  apiSecret: string;
};

const connections = new Map<string, Connection>();

function scheduleApply(conn: Connection) {
  if (conn.applyTimer) clearTimeout(conn.applyTimer);
  conn.applyTimer = setTimeout(() => {
    conn.applyTimer = null;
    void flushWallets(conn);
  }, APPLY_DEBOUNCE_MS);
}

async function flushWallets(conn: Connection) {
  const wallets = [...conn.walletCache.values()].filter((w) => Math.abs(w.balance) > 1e-10);
  if (wallets.length === 0) return;

  try {
    await applyExchangeWallets(
      conn.exchangeId,
      wallets.map((w) => ({
        type: w.type,
        currency: w.currency,
        balance: w.balance,
        availableBalance: w.availableBalance,
      })),
    );
    watchSymbols(wallets.map((w) => w.currency));
    broadcastPortfolioUpdate({ exchangeId: conn.exchangeId, source: "bitfinex-ws" });
  } catch (err) {
    console.error(`[bitfinex-ws] Failed to apply wallets for ${conn.exchangeId}:`, err);
  }
}

function mergeWallet(conn: Connection, wallet: BitfinexWallet) {
  if (Math.abs(wallet.balance) < 1e-10) {
    conn.walletCache.delete(walletKey(wallet));
  } else {
    conn.walletCache.set(walletKey(wallet), wallet);
  }
  scheduleApply(conn);
}

function handleWalletPayload(conn: Connection, channel: "ws" | "wu", payload: unknown) {
  if (channel === "ws") {
    if (!Array.isArray(payload)) return;
    conn.walletCache.clear();
    for (const row of payload) {
      if (!Array.isArray(row) || row.length < 4) continue;
      const wallet = parseBitfinexWalletRow(row as Parameters<typeof parseBitfinexWalletRow>[0]);
      if (Math.abs(wallet.balance) >= 1e-10) conn.walletCache.set(walletKey(wallet), wallet);
    }
    scheduleApply(conn);
    return;
  }

  if (!Array.isArray(payload) || payload.length < 4 || typeof payload[0] !== "string") return;
  mergeWallet(
    conn,
    parseBitfinexWalletRow(payload as Parameters<typeof parseBitfinexWalletRow>[0]),
  );
}

function handleMessage(conn: Connection, raw: string) {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (typeof msg === "object" && msg !== null && "event" in msg) {
    const ev = msg as {
      event: string;
      status?: string;
      msg?: string;
      platform?: { status: number };
    };

    if (ev.event === "info" && ev.platform?.status === 1 && !conn.authSent) {
      conn.authSent = true;
      conn.ws.send(JSON.stringify(buildWsAuthMessage(conn.apiKey, conn.apiSecret)));
      return;
    }

    if (ev.event === "auth") {
      if (ev.status === "OK") {
        conn.authenticated = true;
        console.log(`[bitfinex-ws] Authenticated exchange ${conn.exchangeId}`);
      } else {
        console.error(
          `[bitfinex-ws] Auth failed for ${conn.exchangeId}: ${ev.msg ?? ev.status}`,
        );
        conn.ws.close();
      }
    }
    return;
  }

  if (!Array.isArray(msg) || msg.length < 2) return;

  const [, channel, payload] = msg as [number, string, unknown];

  if (channel === "ws" || channel === "wu") {
    handleWalletPayload(conn, channel, payload);
    return;
  }

  if (channel === "te" || channel === "tu" || channel === "on" || channel === "ou" || channel === "oc") {
    broadcastPortfolioUpdate({ exchangeId: conn.exchangeId, source: "bitfinex-ws", event: channel });
  }
}

async function connectExchange(exchange: typeof exchanges.$inferSelect) {
  if (!exchange.apiKeyEncrypted || !exchange.apiSecretEncrypted) return;

  disconnectExchange(exchange.id);

  const apiKey = await decrypt(exchange.apiKeyEncrypted);
  const apiSecret = await decrypt(exchange.apiSecretEncrypted);
  const ws = new WebSocket(BFX_AUTH_WS);

  const conn: Connection = {
    exchangeId: exchange.id,
    ws,
    walletCache: new Map(),
    applyTimer: null,
    authenticated: false,
    authSent: false,
    apiKey,
    apiSecret,
  };
  connections.set(exchange.id, conn);

  ws.onopen = () => {
    // Auth is sent after the info/platform ready event (see handleMessage).
  };

  ws.onmessage = (ev) => handleMessage(conn, String(ev.data));

  ws.onclose = () => {
    if (conn.applyTimer) clearTimeout(conn.applyTimer);
    if (connections.get(exchange.id) === conn) {
      connections.delete(exchange.id);
      setTimeout(() => {
        void refreshBitfinexAccountStreams();
      }, RECONNECT_MS);
    }
  };

  ws.onerror = () => ws.close();
}

export function disconnectExchange(exchangeId: string) {
  const conn = connections.get(exchangeId);
  if (!conn) return;
  if (conn.applyTimer) clearTimeout(conn.applyTimer);
  conn.ws.onclose = null;
  conn.ws.close();
  connections.delete(exchangeId);
}

export async function refreshBitfinexAccountStreams() {
  const active = await db
    .select()
    .from(exchanges)
    .where(and(eq(exchanges.type, "bitfinex"), eq(exchanges.isActive, true)));

  const activeIds = new Set(active.map((e) => e.id));

  for (const id of connections.keys()) {
    if (!activeIds.has(id)) disconnectExchange(id);
  }

  for (const exchange of active) {
    if (connections.has(exchange.id)) continue;
    void connectExchange(exchange);
  }
}

export async function startBitfinexAccountStreams() {
  await refreshBitfinexAccountStreams();
  console.log(`[bitfinex-ws] Account streams started (${connections.size} connection(s))`);
}
