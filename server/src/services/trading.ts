import { db } from "../db";
import { exchanges } from "../db/schema";
import { decrypt } from "./crypto";
import { submitOrder, fetchTickers } from "./bitfinex";
import { getLatestPortfolio, syncExchange } from "./portfolio";
import { eq } from "drizzle-orm";

export interface ProposedTrade {
  exchangeId: string;
  symbol: string;
  side: "buy" | "sell";
  amount: number;
  orderType?: "market" | "limit";
  price?: number;
  rationale?: string;
}

export interface TradeProposal {
  id: string;
  clientId: string;
  summary: string;
  trades: ProposedTrade[];
  targetAllocation?: Record<string, number>;
  createdAt: number;
  expiresAt: number;
}

export interface TradeExecutionResult {
  trade: ProposedTrade;
  success: boolean;
  result?: unknown;
  error?: string;
}

const PROPOSAL_TTL_MS = 10 * 60 * 1000;
const MAX_TRADES_PER_PROPOSAL = 8;
const proposals = new Map<string, TradeProposal>();

function maxUsdPerOrder(): number {
  const raw = process.env.TRADE_MAX_USD_PER_ORDER;
  if (!raw) return 25_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 25_000;
}

function normalizeSymbol(symbol: string): string {
  const s = symbol.toUpperCase().replace(/^T/, "");
  if (s.startsWith("T") && s.length > 1) return s;
  if (s.endsWith("USD") || s.endsWith("UST")) return `t${s}`;
  return `t${s}USD`;
}

function baseCurrency(symbol: string): string {
  const s = symbol.replace(/^t/i, "");
  return s.replace(/USD$|UST$|USDT$/, "");
}

export async function validateTrades(trades: ProposedTrade[]): Promise<void> {
  if (trades.length === 0) throw new Error("At least one trade required");
  if (trades.length > MAX_TRADES_PER_PROPOSAL) {
    throw new Error(`Maximum ${MAX_TRADES_PER_PROPOSAL} trades per proposal`);
  }

  const portfolio = await getLatestPortfolio();
  const maxUsd = maxUsdPerOrder();

  for (const trade of trades) {
    if (!trade.exchangeId || !trade.symbol || !trade.side) {
      throw new Error("Each trade needs exchangeId, symbol, and side");
    }
    if (trade.amount <= 0 || !Number.isFinite(trade.amount)) {
      throw new Error(`Invalid amount for ${trade.symbol}`);
    }

    const [exchange] = await db
      .select()
      .from(exchanges)
      .where(eq(exchanges.id, trade.exchangeId));
    if (!exchange) throw new Error(`Exchange not found: ${trade.exchangeId}`);
    if (exchange.type !== "bitfinex") {
      throw new Error(`Trading not supported on ${exchange.type} yet — use Bitfinex`);
    }
    if (!exchange.isActive) throw new Error(`Exchange ${exchange.label} is inactive`);

    const currency = baseCurrency(trade.symbol);
    const prices = await fetchTickers([currency]);
    const price = trade.price ?? prices.get(currency) ?? 0;
    const notional = trade.amount * (price || 1);
    if (notional > maxUsd) {
      throw new Error(
        `Trade ${trade.symbol} ${trade.side} ~$${notional.toFixed(0)} exceeds max $${maxUsd} per order`,
      );
    }

    if (trade.side === "sell") {
      const holding = portfolio.wallets.find(
        (w) => w.exchangeId === trade.exchangeId && w.currency === currency,
      );
      const available = holding?.availableBalance ?? holding?.balance ?? 0;
      if (trade.amount > available * 1.001) {
        throw new Error(
          `Insufficient ${currency} on ${exchange.label}: need ${trade.amount}, have ~${available}`,
        );
      }
    }
  }
}

export async function createProposal(
  clientId: string,
  summary: string,
  trades: ProposedTrade[],
  targetAllocation?: Record<string, number>,
): Promise<TradeProposal> {
  await validateTrades(trades);

  const proposal: TradeProposal = {
    id: crypto.randomUUID(),
    clientId,
    summary,
    trades,
    targetAllocation,
    createdAt: Date.now(),
    expiresAt: Date.now() + PROPOSAL_TTL_MS,
  };

  proposals.set(proposal.id, proposal);
  return proposal;
}

export function getProposal(id: string, clientId: string): TradeProposal | null {
  const p = proposals.get(id);
  if (!p || p.clientId !== clientId) return null;
  if (Date.now() > p.expiresAt) {
    proposals.delete(id);
    return null;
  }
  return p;
}

export async function executeProposal(
  proposalId: string,
  clientId: string,
): Promise<{ results: TradeExecutionResult[]; portfolio: Awaited<ReturnType<typeof getLatestPortfolio>> }> {
  const proposal = getProposal(proposalId, clientId);
  if (!proposal) throw new Error("Proposal not found or expired");

  const results: TradeExecutionResult[] = [];
  const syncedExchanges = new Set<string>();

  for (const trade of proposal.trades) {
    try {
      const [exchange] = await db
        .select()
        .from(exchanges)
        .where(eq(exchanges.id, trade.exchangeId));
      if (!exchange?.apiKeyEncrypted || !exchange.apiSecretEncrypted) {
        throw new Error("Missing API credentials");
      }

      const apiKey = await decrypt(exchange.apiKeyEncrypted);
      const apiSecret = await decrypt(exchange.apiSecretEncrypted);
      const symbol = normalizeSymbol(trade.symbol);
      const signedAmount = trade.side === "buy" ? trade.amount : -trade.amount;

      const result = await submitOrder(apiKey, apiSecret, {
        symbol,
        amount: signedAmount,
        type: trade.orderType === "limit" ? "EXCHANGE LIMIT" : "EXCHANGE MARKET",
        price: trade.price,
      });

      syncedExchanges.add(trade.exchangeId);
      results.push({ trade, success: true, result });
    } catch (err) {
      results.push({
        trade,
        success: false,
        error: err instanceof Error ? err.message : "Execution failed",
      });
    }
  }

  for (const exchangeId of syncedExchanges) {
    try {
      await syncExchange(exchangeId);
    } catch {
      // sync failure shouldn't hide trade results
    }
  }

  proposals.delete(proposalId);
  const portfolio = await getLatestPortfolio();
  return { results, portfolio };
}
