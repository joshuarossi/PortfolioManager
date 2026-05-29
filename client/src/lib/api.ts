export interface Exchange {
  id: string;
  name: string;
  type: string;
  label: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  walletAddress?: string | null;
}

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
  pricesAsOf: string | null;
}

export interface PortfolioHistoryPoint {
  date: string;
  totalUsdValue: number;
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

export interface AiInsight {
  type: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  suggestion?: string;
}

export interface AiStatus {
  available: boolean;
  model: string | null;
  providers: string[];
}

export interface MarketQuote {
  last: number;
  bid: number;
  ask: number;
  volume: number;
}

export interface MarketPricesResult {
  prices: Record<string, number>;
  quotes: Record<string, MarketQuote>;
  fetchedAt: string;
  symbols: string[];
  source: "websocket" | "rest";
}

export interface PortfolioPnl {
  currentValue: number;
  depositsUsd: number;
  withdrawsUsd: number;
  netDeposits: number;
  pnl: number;
  pnlPercent: number | null;
  sources: string[];
}

export interface ProposedTrade {
  exchangeId: string;
  symbol: string;
  side: "buy" | "sell";
  amount: number;
  orderType?: "market" | "limit";
  price?: number;
  rationale?: string;
}

export interface TradeProposalPayload {
  proposalId: string;
  summary: string;
  trades: ProposedTrade[];
  targetAllocation?: Record<string, number>;
  expiresAt: number;
}

export interface TradeExecutionResult {
  trade: ProposedTrade;
  success: boolean;
  result?: unknown;
  error?: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return response.json();
}

export const api = {
  getPortfolio: () => request<PortfolioSummary>("/api/portfolio"),
  getPortfolioPnl: () => request<PortfolioPnl>("/api/portfolio/pnl"),
  getPortfolioPnlDashboard: (days = 30) =>
    request<PortfolioPnlDashboard>(`/api/portfolio/pnl/dashboard?days=${days}`),
  getPnlHistory: (days = 30) =>
    request<PnlHistoryPoint[]>(`/api/portfolio/pnl/history?days=${days}`),
  getPortfolioHistory: (days = 30) =>
    request<PortfolioHistoryPoint[]>(`/api/portfolio/history?days=${days}`),
  syncAll: () =>
    request<{ results: unknown[]; portfolio: PortfolioSummary }>("/api/portfolio/sync", {
      method: "POST",
    }),

  getExchanges: () => request<Exchange[]>("/api/exchanges"),
  getWalletChallenge: (address: string) =>
    request<{ message: string; timestamp: number }>(
      `/api/exchanges/wallet/challenge?address=${encodeURIComponent(address)}`,
    ),
  addBitfinexExchange: (data: { label: string; apiKey: string; apiSecret: string }) =>
    request<Exchange>("/api/exchanges", {
      method: "POST",
      body: JSON.stringify({ type: "bitfinex", ...data }),
    }),
  addHyperliquidExchange: (data: {
    label: string;
    walletAddress: string;
    signature: string;
    message: string;
  }) =>
    request<Exchange>("/api/exchanges", {
      method: "POST",
      body: JSON.stringify({ type: "hyperliquid", ...data }),
    }),
  syncExchange: (id: string) =>
    request<{ success: boolean; walletCount: number }>(`/api/exchanges/${id}/sync`, {
      method: "POST",
    }),
  deleteExchange: (id: string) =>
    request<{ success: boolean }>(`/api/exchanges/${id}`, { method: "DELETE" }),

  getInsights: () => request<AiInsight[]>("/api/ai/insights"),
  getAiStatus: () => request<AiStatus>("/api/ai/status"),
  getMarketPrices: (symbols?: string[]) =>
    request<MarketPricesResult>(
      symbols?.length
        ? `/api/market/prices?symbols=${encodeURIComponent(symbols.join(","))}`
        : "/api/market/prices",
    ),

  executeTradeProposal: (proposalId: string, clientId: string) =>
    request<{ success: boolean; results: TradeExecutionResult[]; portfolio: PortfolioSummary }>(
      `/api/trades/proposals/${proposalId}/execute`,
      { method: "POST", body: JSON.stringify({ clientId }) },
    ),
};

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCrypto(value: number, currency: string): string {
  const decimals = ["BTC", "ETH"].includes(currency) ? 6 : 4;
  return `${value.toFixed(decimals)} ${currency}`;
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
