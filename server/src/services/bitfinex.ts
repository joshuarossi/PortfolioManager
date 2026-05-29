import { createHmac } from "node:crypto";

const BASE_URL = "https://api.bitfinex.com";

export interface BitfinexWallet {
  type: string;
  currency: string;
  balance: number;
  unsettledInterest: number;
  availableBalance: number | null;
  lastChange: string | null;
}

export interface BitfinexTicker {
  symbol: string;
  lastPrice: number;
}

function sign(apiSecret: string, path: string, nonce: string, body: string): string {
  const payload = `/api${path}${nonce}${body}`;
  return createHmac("sha384", apiSecret).update(payload).digest("hex");
}

const lastNonceByApiKey = new Map<string, number>();

function nextNonce(apiKey: string): string {
  const now = Date.now();
  const prev = lastNonceByApiKey.get(apiKey) ?? 0;
  const next = Math.max(now, prev + 1);
  lastNonceByApiKey.set(apiKey, next);
  return String(next);
}

async function authenticatedRequest<T>(
  apiKey: string,
  apiSecret: string,
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const nonce = nextNonce(apiKey);
  const rawBody = JSON.stringify(body);
  const signature = sign(apiSecret, path, nonce, rawBody);

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "bfx-apikey": apiKey,
      "bfx-nonce": nonce,
      "bfx-signature": signature,
    },
    body: rawBody,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bitfinex API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchWallets(
  apiKey: string,
  apiSecret: string,
): Promise<BitfinexWallet[]> {
  const data = await authenticatedRequest<
    [string, string, number, number, number | null, string | null][]
  >(apiKey, apiSecret, "/v2/auth/r/wallets");

  return data.map(([type, currency, balance, unsettledInterest, availableBalance, lastChange]) => ({
    type,
    currency: normalizeCurrency(currency),
    balance,
    unsettledInterest,
    availableBalance,
    lastChange,
  }));
}

export async function testConnection(
  apiKey: string,
  apiSecret: string,
): Promise<{ ok: boolean; walletCount: number }> {
  const wallets = await fetchWallets(apiKey, apiSecret);
  return { ok: true, walletCount: wallets.length };
}

export interface BitfinexQuote {
  last: number;
  bid: number;
  ask: number;
  volume: number;
}

export function parseBitfinexTicker(data: number[]): BitfinexQuote {
  return {
    bid: data[0] ?? 0,
    ask: data[2] ?? 0,
    last: data[6] ?? 0,
    volume: data[7] ?? 0,
  };
}

async function fetchTickerArray(pair: string): Promise<number[] | null> {
  const response = await fetch(`${BASE_URL}/v2/ticker/${pair}`);
  if (!response.ok) return null;
  return (await response.json()) as number[];
}

export async function fetchTickers(symbols: string[]): Promise<Map<string, number>> {
  const quotes = await fetchTickerQuotes(symbols);
  const prices = new Map<string, number>();
  for (const [symbol, q] of quotes) prices.set(symbol, q.last);
  return prices;
}

export async function fetchTickerQuotes(symbols: string[]): Promise<Map<string, BitfinexQuote>> {
  const quotes = new Map<string, BitfinexQuote>();
  if (symbols.length === 0) return quotes;

  const unique = [...new Set(symbols.filter((s) => s !== "USD" && s !== "UST" && s !== "USDT"))];

  for (const symbol of unique) {
    try {
      let data = await fetchTickerArray(`t${symbol}USD`);
      if (!data) data = await fetchTickerArray(`t${symbol}UST`);
      if (!data || data[6] <= 0) continue;
      quotes.set(symbol, parseBitfinexTicker(data));
    } catch {
      // skip unavailable pairs
    }
  }

  return quotes;
}

const STABLE_USD = new Set(["USD", "UST", "USDT", "USDC", "DAI"]);

function movementToUsd(amount: number, currency: string, prices: Map<string, number>): number {
  const cur = normalizeCurrency(currency);
  if (STABLE_USD.has(cur)) return Math.abs(amount);
  const px = prices.get(cur) ?? 0;
  return Math.abs(amount) * px;
}

/** Bitfinex movement row: https://docs.bitfinex.com/reference/rest-auth-movements */
const MOVEMENT = {
  CURRENCY: 1,
  MTS_UPDATED: 6,
  STATUS: 9,
  AMOUNT: 12,
} as const;

export interface BitfinexMovement {
  updatedAt: Date;
  currency: string;
  amount: number;
  amountUsd: number;
}

function parseMovementAmount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return parseFloat(raw);
  return 0;
}

function parseMovementTimestamp(raw: unknown): Date | null {
  const ms = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms);
}

/** Completed deposit/withdrawal events with USD amounts. */
export async function fetchMovementHistory(
  apiKey: string,
  apiSecret: string,
): Promise<BitfinexMovement[]> {
  const rows = await authenticatedRequest<unknown[]>(apiKey, apiSecret, "/v2/auth/r/movements/hist", {
    limit: 100,
  });

  if (!Array.isArray(rows)) return [];

  const currencies = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    if (row[MOVEMENT.STATUS] !== "COMPLETED") continue;
    currencies.add(normalizeCurrency(String(row[MOVEMENT.CURRENCY])));
  }
  const prices = await fetchTickers([...currencies]);

  const movements: BitfinexMovement[] = [];

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    if (row[MOVEMENT.STATUS] !== "COMPLETED") continue;

    const amount = parseMovementAmount(row[MOVEMENT.AMOUNT]);
    if (amount === 0) continue;

    const updatedAt = parseMovementTimestamp(row[MOVEMENT.MTS_UPDATED]);
    if (!updatedAt) continue;

    const currency = normalizeCurrency(String(row[MOVEMENT.CURRENCY]));
    movements.push({
      updatedAt,
      currency,
      amount,
      amountUsd: movementToUsd(amount, currency, prices),
    });
  }

  return movements.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
}

/** Completed deposit/withdrawal totals in USD (withdraws as positive number). */
export async function fetchMovementFlowsUsd(
  apiKey: string,
  apiSecret: string,
): Promise<{ depositsUsd: number; withdrawsUsd: number }> {
  const movements = await fetchMovementHistory(apiKey, apiSecret);

  let depositsUsd = 0;
  let withdrawsUsd = 0;

  for (const m of movements) {
    if (m.amount > 0) depositsUsd += m.amountUsd;
    else withdrawsUsd += m.amountUsd;
  }

  return { depositsUsd, withdrawsUsd };
}

function normalizeCurrency(currency: string): string {
  if (currency.startsWith("t") || currency.startsWith("f")) {
    return currency.slice(1);
  }
  return currency;
}

export function parseBitfinexWalletRow(
  row: [string, string, number, number, number | null, string | null, ...unknown[]],
): BitfinexWallet {
  const [type, currency, balance, unsettledInterest, availableBalance, lastChange] = row;
  return {
    type,
    currency: normalizeCurrency(currency),
    balance,
    unsettledInterest,
    availableBalance,
    lastChange,
  };
}

export function createWsAuthPayload(apiSecret: string, authNonce = Date.now() * 1000) {
  const authPayload = `AUTH${authNonce}`;
  const authSig = createHmac("sha384", apiSecret).update(authPayload).digest("hex");
  return { authNonce, authPayload, authSig };
}

export function buildWsAuthMessage(
  apiKey: string,
  apiSecret: string,
  filter: string[] = ["wallet", "balance", "trade", "order"],
) {
  const { authNonce, authPayload, authSig } = createWsAuthPayload(apiSecret);
  return {
    event: "auth",
    apiKey,
    authSig,
    authNonce,
    authPayload,
    filter,
  };
}

export interface SubmitOrderParams {
  symbol: string;
  amount: number;
  price?: number;
  type?: "EXCHANGE MARKET" | "EXCHANGE LIMIT";
}

export async function submitOrder(
  apiKey: string,
  apiSecret: string,
  params: SubmitOrderParams,
): Promise<unknown> {
  const body = {
    type: params.type ?? "EXCHANGE MARKET",
    symbol: params.symbol.startsWith("t") ? params.symbol : `t${params.symbol}`,
    amount: String(params.amount),
    ...(params.price != null ? { price: String(params.price) } : {}),
  };
  return authenticatedRequest(apiKey, apiSecret, "/v2/auth/w/order/submit", body);
}
