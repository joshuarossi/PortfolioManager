import { db } from "../db";
import { exchanges } from "../db/schema";
import { decrypt } from "./crypto";
import { fetchMovementHistory, type BitfinexMovement } from "./bitfinex";
import { getLatestPortfolio, getDailyPortfolioValues } from "./portfolio";
import { eq, and } from "drizzle-orm";

export interface PortfolioPnl {
  currentValue: number;
  depositsUsd: number;
  withdrawsUsd: number;
  /** Net capital deposited (deposits − withdraws) */
  netDeposits: number;
  /** currentValue − netDeposits */
  pnl: number;
  pnlPercent: number | null;
  sources: string[];
}

export interface PnlHistoryPoint {
  date: string;
  portfolioValue: number;
  netDeposits: number;
  pnl: number;
}

export interface PortfolioPnlDashboard {
  pnl: PortfolioPnl;
  history: PnlHistoryPoint[];
}

const MOVEMENTS_CACHE_MS = 60_000;

let cachedMovements: { at: number; data: BitfinexMovement[] } | null = null;
let movementsInFlight: Promise<BitfinexMovement[]> | null = null;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function endOfDayUtc(day: string): Date {
  return new Date(`${day}T23:59:59.999Z`);
}

function sumMovementFlows(movements: BitfinexMovement[]) {
  let depositsUsd = 0;
  let withdrawsUsd = 0;
  for (const m of movements) {
    if (m.amount > 0) depositsUsd += m.amountUsd;
    else withdrawsUsd += m.amountUsd;
  }
  return { depositsUsd, withdrawsUsd, netDeposits: depositsUsd - withdrawsUsd };
}

function netDepositsThrough(movements: BitfinexMovement[], through: Date): number {
  let deposits = 0;
  let withdraws = 0;
  for (const m of movements) {
    if (m.updatedAt > through) continue;
    if (m.amount > 0) deposits += m.amountUsd;
    else withdraws += m.amountUsd;
  }
  return deposits - withdraws;
}

async function fetchAllMovementsUncached(): Promise<BitfinexMovement[]> {
  const bitfinexAccounts = await db
    .select()
    .from(exchanges)
    .where(and(eq(exchanges.type, "bitfinex"), eq(exchanges.isActive, true)));

  const all: BitfinexMovement[] = [];
  const errors: string[] = [];

  for (const exchange of bitfinexAccounts) {
    if (!exchange.apiKeyEncrypted || !exchange.apiSecretEncrypted) continue;
    try {
      const apiKey = await decrypt(exchange.apiKeyEncrypted);
      const apiSecret = await decrypt(exchange.apiSecretEncrypted);
      const movements = await fetchMovementHistory(apiKey, apiSecret);
      all.push(...movements);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push(`${exchange.label}: ${message}`);
      console.error(`[pnl] movements for ${exchange.label}:`, err);
    }
  }

  if (bitfinexAccounts.length > 0 && all.length === 0 && errors.length > 0) {
    throw new Error(`Failed to load Bitfinex movements: ${errors.join("; ")}`);
  }

  return all.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
}

async function fetchAllMovements(): Promise<BitfinexMovement[]> {
  if (cachedMovements && Date.now() - cachedMovements.at < MOVEMENTS_CACHE_MS) {
    return cachedMovements.data;
  }

  if (movementsInFlight) return movementsInFlight;

  movementsInFlight = fetchAllMovementsUncached()
    .then((data) => {
      cachedMovements = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      movementsInFlight = null;
    });

  return movementsInFlight;
}

async function getBitfinexSources(): Promise<string[]> {
  return (
    await db
      .select({ label: exchanges.label })
      .from(exchanges)
      .where(and(eq(exchanges.type, "bitfinex"), eq(exchanges.isActive, true)))
  ).map((e) => e.label);
}

function buildPortfolioPnl(currentValue: number, movements: BitfinexMovement[], sources: string[]): PortfolioPnl {
  const { depositsUsd, withdrawsUsd, netDeposits } = sumMovementFlows(movements);
  const pnl = currentValue - netDeposits;
  const pnlPercent = netDeposits > 1 ? (pnl / netDeposits) * 100 : null;

  return {
    currentValue,
    depositsUsd,
    withdrawsUsd,
    netDeposits,
    pnl,
    pnlPercent,
    sources,
  };
}

function buildPnlHistory(
  days: number,
  movements: BitfinexMovement[],
  dailyValues: { date: string; totalUsdValue: number }[],
  liveValue: number,
): PnlHistoryPoint[] {
  const valueByDay = new Map(dailyValues.map((v) => [v.date, v.totalUsdValue]));

  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  start.setUTCHours(0, 0, 0, 0);

  const today = dayKey(new Date());
  const points: PnlHistoryPoint[] = [];

  let lastPortfolioValue = 0;
  let lastNetDeposits = 0;

  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const day = dayKey(d);
    const through = endOfDayUtc(day);

    const netDeposits = netDepositsThrough(movements, through);
    const snapshotValue = valueByDay.get(day);

    if (snapshotValue != null) {
      lastPortfolioValue = snapshotValue;
    } else if (netDeposits > lastNetDeposits) {
      lastPortfolioValue = netDeposits;
    }

    lastNetDeposits = netDeposits;

    const portfolioValue = netDeposits > 0 || lastPortfolioValue > 0 ? lastPortfolioValue : 0;
    const pnl = portfolioValue - netDeposits;

    points.push({ date: day, portfolioValue, netDeposits, pnl });

    if (day === today) break;
  }

  const liveNetDeposits = netDepositsThrough(movements, new Date());
  const last = points[points.length - 1];

  if (
    last &&
    (last.date === today || last.date.startsWith(today)) &&
    (liveValue !== last.portfolioValue || liveNetDeposits !== last.netDeposits)
  ) {
    points[points.length - 1] = {
      date: new Date().toISOString(),
      portfolioValue: liveValue,
      netDeposits: liveNetDeposits,
      pnl: liveValue - liveNetDeposits,
    };
  }

  return points;
}

export async function getPortfolioPnlDashboard(days = 30): Promise<PortfolioPnlDashboard> {
  const [movements, portfolio, dailyValues, sources] = await Promise.all([
    fetchAllMovements(),
    getLatestPortfolio(),
    getDailyPortfolioValues(days),
    getBitfinexSources(),
  ]);

  const currentValue = portfolio.totalUsdValue;
  const pnl = buildPortfolioPnl(currentValue, movements, sources);
  const history = buildPnlHistory(days, movements, dailyValues, currentValue);

  return { pnl, history };
}

export async function getPortfolioPnl(): Promise<PortfolioPnl> {
  const { pnl } = await getPortfolioPnlDashboard(30);
  return pnl;
}

export async function getPnlHistory(days = 30): Promise<PnlHistoryPoint[]> {
  const { history } = await getPortfolioPnlDashboard(days);
  return history;
}
