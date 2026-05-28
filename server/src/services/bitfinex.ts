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

async function authenticatedRequest<T>(
  apiKey: string,
  apiSecret: string,
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const nonce = Date.now().toString();
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

export async function fetchTickers(symbols: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (symbols.length === 0) return prices;

  const unique = [...new Set(symbols.filter((s) => s !== "USD" && s !== "UST" && s !== "USDT"))];

  for (const symbol of unique) {
    try {
      const pair = `t${symbol}USD`;
      const response = await fetch(`${BASE_URL}/v2/ticker/${pair}`);
      if (!response.ok) {
        const ustResponse = await fetch(`${BASE_URL}/v2/ticker/t${symbol}UST`);
        if (ustResponse.ok) {
          const data = (await ustResponse.json()) as number[];
          prices.set(symbol, data[6]);
        }
        continue;
      }
      const data = (await response.json()) as number[];
      prices.set(symbol, data[6]); // LAST_PRICE
    } catch {
      // skip unavailable pairs
    }
  }

  prices.set("USD", 1);
  prices.set("UST", 1);
  prices.set("USDT", 1);
  prices.set("DAI", 1);
  prices.set("USDC", 1);

  return prices;
}

function normalizeCurrency(currency: string): string {
  if (currency.startsWith("t") || currency.startsWith("f")) {
    return currency.slice(1);
  }
  return currency;
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
  return authenticatedRequest(apiKey, apiSecret, "/v2/auth/w/submit", body);
}
