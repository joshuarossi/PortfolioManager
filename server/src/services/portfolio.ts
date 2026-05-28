import { db } from "../db";
import { balanceSnapshots, exchanges, portfolioSnapshots } from "../db/schema";
import { decrypt } from "./crypto";
import { fetchWallets as fetchBitfinexWallets, fetchTickers } from "./bitfinex";
import { fetchWallets as fetchHyperliquidWallets } from "./hyperliquid";
import { eq, desc, gte, and } from "drizzle-orm";

export interface WalletBalance {
  exchangeId: string;
  exchangeLabel: string;
  exchangeType: string;
  walletType: string;
  currency: string;
  balance: number;
  availableBalance: number | null;
  usdValue: number;
}

export interface PortfolioSummary {
  totalUsdValue: number;
  wallets: WalletBalance[];
  byCurrency: Record<string, { balance: number; usdValue: number }>;
  byExchange: Record<string, { usdValue: number; walletCount: number }>;
  lastUpdated: string | null;
}

interface NormalizedWallet {
  type: string;
  currency: string;
  balance: number;
  availableBalance: number | null;
  usdValue?: number;
}

function id(): string {
  return crypto.randomUUID();
}

async function fetchExchangeWallets(
  exchange: typeof exchanges.$inferSelect,
): Promise<NormalizedWallet[]> {
  if (exchange.type === "bitfinex") {
    if (!exchange.apiKeyEncrypted || !exchange.apiSecretEncrypted) {
      throw new Error("Bitfinex credentials missing");
    }
    const apiKey = await decrypt(exchange.apiKeyEncrypted);
    const apiSecret = await decrypt(exchange.apiSecretEncrypted);
    const wallets = await fetchBitfinexWallets(apiKey, apiSecret);
    return wallets.map((w) => ({
      type: w.type,
      currency: w.currency,
      balance: w.balance,
      availableBalance: w.availableBalance,
    }));
  }

  if (exchange.type === "hyperliquid") {
    if (!exchange.walletAddress) {
      throw new Error("Hyperliquid wallet address missing");
    }
    const wallets = await fetchHyperliquidWallets(exchange.walletAddress);
    return wallets.map((w) => ({
      type: w.type,
      currency: w.currency,
      balance: w.balance,
      availableBalance: w.availableBalance,
      usdValue: w.usdValue,
    }));
  }

  throw new Error(`Unsupported exchange type: ${exchange.type}`);
}

export async function syncExchange(exchangeId: string): Promise<WalletBalance[]> {
  const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, exchangeId));
  if (!exchange) throw new Error("Exchange not found");

  const rawWallets = await fetchExchangeWallets(exchange);
  const capturedAt = new Date();
  const results: WalletBalance[] = [];

  let prices: Map<string, number> | null = null;
  if (exchange.type === "bitfinex") {
    const currencies = rawWallets
      .filter((w) => Math.abs(w.balance) > 1e-10)
      .map((w) => w.currency);
    prices = await fetchTickers(currencies);
  }

  for (const wallet of rawWallets) {
    if (Math.abs(wallet.balance) < 1e-10) continue;

    const usdValue =
      wallet.usdValue ??
      wallet.balance * (prices?.get(wallet.currency) ?? (wallet.currency === "USD" || wallet.currency === "USDC" ? 1 : 0));

    await db.insert(balanceSnapshots).values({
      id: id(),
      exchangeId: exchange.id,
      walletType: wallet.type,
      currency: wallet.currency,
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      usdValue,
      capturedAt,
    });

    results.push({
      exchangeId: exchange.id,
      exchangeLabel: exchange.label,
      exchangeType: exchange.type,
      walletType: wallet.type,
      currency: wallet.currency,
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      usdValue,
    });
  }

  await db
    .update(exchanges)
    .set({ lastSyncedAt: capturedAt })
    .where(eq(exchanges.id, exchangeId));

  await capturePortfolioSnapshot(results, capturedAt);

  return results;
}

async function capturePortfolioSnapshot(wallets: WalletBalance[], capturedAt: Date) {
  const totalUsdValue = wallets.reduce((sum, w) => sum + w.usdValue, 0);
  const breakdown = {
    byCurrency: aggregateByCurrency(wallets),
    byExchange: aggregateByExchange(wallets),
  };

  await db.insert(portfolioSnapshots).values({
    id: id(),
    totalUsdValue,
    breakdown: JSON.stringify(breakdown),
    capturedAt,
  });
}

function aggregateByCurrency(wallets: WalletBalance[]) {
  const map: Record<string, { balance: number; usdValue: number }> = {};
  for (const w of wallets) {
    if (!map[w.currency]) map[w.currency] = { balance: 0, usdValue: 0 };
    map[w.currency].balance += w.balance;
    map[w.currency].usdValue += w.usdValue;
  }
  return map;
}

function aggregateByExchange(wallets: WalletBalance[]) {
  const map: Record<string, { usdValue: number; walletCount: number }> = {};
  for (const w of wallets) {
    if (!map[w.exchangeId]) map[w.exchangeId] = { usdValue: 0, walletCount: 0 };
    map[w.exchangeId].usdValue += w.usdValue;
    map[w.exchangeId].walletCount += 1;
  }
  return map;
}

export async function getLatestPortfolio(): Promise<PortfolioSummary> {
  const allExchanges = await db.select().from(exchanges).where(eq(exchanges.isActive, true));

  if (allExchanges.length === 0) {
    return {
      totalUsdValue: 0,
      wallets: [],
      byCurrency: {},
      byExchange: {},
      lastUpdated: null,
    };
  }

  const wallets: WalletBalance[] = [];
  let lastUpdated: Date | null = null;

  for (const exchange of allExchanges) {
    const latest = await db
      .select()
      .from(balanceSnapshots)
      .where(eq(balanceSnapshots.exchangeId, exchange.id))
      .orderBy(desc(balanceSnapshots.capturedAt))
      .limit(100);

    if (latest.length === 0) continue;

    const latestTime = latest[0].capturedAt.getTime();
    const exchangeLatest = latest.filter(
      (s) => s.capturedAt.getTime() === latestTime,
    );

    for (const snap of exchangeLatest) {
      wallets.push({
        exchangeId: exchange.id,
        exchangeLabel: exchange.label,
        exchangeType: exchange.type,
        walletType: snap.walletType,
        currency: snap.currency,
        balance: snap.balance,
        availableBalance: snap.availableBalance,
        usdValue: snap.usdValue ?? 0,
      });
    }

    if (!lastUpdated || latest[0].capturedAt > lastUpdated) {
      lastUpdated = latest[0].capturedAt;
    }
  }

  return {
    totalUsdValue: wallets.reduce((s, w) => s + w.usdValue, 0),
    wallets,
    byCurrency: aggregateByCurrency(wallets),
    byExchange: aggregateByExchange(wallets),
    lastUpdated: lastUpdated?.toISOString() ?? null,
  };
}

export async function getPortfolioHistory(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await db
    .select()
    .from(portfolioSnapshots)
    .where(gte(portfolioSnapshots.capturedAt, since))
    .orderBy(portfolioSnapshots.capturedAt);

  return snapshots.map((s) => ({
    date: s.capturedAt.toISOString(),
    totalUsdValue: s.totalUsdValue,
    breakdown: JSON.parse(s.breakdown) as Record<string, unknown>,
  }));
}

export async function syncAllExchanges() {
  const all = await db.select().from(exchanges).where(eq(exchanges.isActive, true));
  const results = [];
  for (const exchange of all) {
    try {
      const wallets = await syncExchange(exchange.id);
      results.push({ exchangeId: exchange.id, success: true, walletCount: wallets.length });
    } catch (err) {
      results.push({
        exchangeId: exchange.id,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
  return results;
}

export async function getBalanceHistory(exchangeId?: string, currency?: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const conditions = [gte(balanceSnapshots.capturedAt, since)];
  if (exchangeId) conditions.push(eq(balanceSnapshots.exchangeId, exchangeId));
  if (currency) conditions.push(eq(balanceSnapshots.currency, currency));

  const snapshots = await db
    .select()
    .from(balanceSnapshots)
    .where(and(...conditions))
    .orderBy(balanceSnapshots.capturedAt);

  return snapshots.map((s) => ({
    date: s.capturedAt.toISOString(),
    exchangeId: s.exchangeId,
    walletType: s.walletType,
    currency: s.currency,
    balance: s.balance,
    usdValue: s.usdValue,
  }));
}
