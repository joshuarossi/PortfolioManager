import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { getLatestPortfolio } from "../services/portfolio";
import { getInsights } from "../services/ai";
import { createProposal, type ProposedTrade } from "../services/trading";
import { db } from "../db";
import { exchanges } from "../db/schema";

export type TradeProposalPayload = {
  proposalId: string;
  summary: string;
  trades: ProposedTrade[];
  targetAllocation?: Record<string, number>;
  expiresAt: number;
};

type NotifyFn = (payload: { type: "trade_proposal"; proposal: TradeProposalPayload }) => void;

export function createPortfolioTools(getAppContext: () => unknown, clientId: string, notify: NotifyFn) {
  const getPortfolioSummary = defineTool({
    name: "get_portfolio_summary",
    label: "Get Portfolio Summary",
    description:
      "Returns the user's current portfolio: total USD value, holdings by currency, wallet balances across exchanges, and last sync time. Always call this before giving allocation or rebalancing advice.",
    parameters: Type.Object({}),
    execute: async () => {
      const portfolio = await getLatestPortfolio();
      return {
        content: [{ type: "text", text: JSON.stringify(portfolio, null, 2) }],
        details: { portfolio },
      };
    },
  });

  const getPortfolioInsights = defineTool({
    name: "get_portfolio_insights",
    label: "Get Portfolio Insights",
    description:
      "Returns automated risk and allocation insights: concentration, diversification, stablecoin allocation, and leveraged/perp exposure flags.",
    parameters: Type.Object({}),
    execute: async () => {
      const insights = await getInsights();
      return {
        content: [{ type: "text", text: JSON.stringify(insights, null, 2) }],
        details: { insights },
      };
    },
  });

  const getConnectedExchanges = defineTool({
    name: "get_connected_exchanges",
    label: "Get Connected Exchanges",
    description:
      "Returns connected exchange accounts. Only Bitfinex accounts support automated trading.",
    parameters: Type.Object({}),
    execute: async () => {
      const all = await db.select().from(exchanges);
      const summary = all.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        label: e.label,
        isActive: e.isActive,
        tradable: e.type === "bitfinex" && e.isActive,
        walletAddress: e.walletAddress,
        lastSyncedAt: e.lastSyncedAt?.toISOString() ?? null,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        details: { exchanges: summary },
      };
    },
  });

  const getCurrentAppContext = defineTool({
    name: "get_current_app_context",
    label: "Get Current App Context",
    description:
      "Returns the current browser UI context: active page, route, and any filters or selections the user has open.",
    parameters: Type.Object({}),
    execute: async () => ({
      content: [{ type: "text", text: JSON.stringify(getAppContext(), null, 2) }],
      details: { context: getAppContext() },
    }),
  });

  const proposePortfolioTrades = defineTool({
    name: "propose_portfolio_trades",
    label: "Propose Portfolio Trades",
    description:
      "Propose a rebalancing plan as specific Bitfinex market/limit orders. The user must approve in the UI before any order executes. Call get_portfolio_summary and get_portfolio_insights first. Use exchangeId from get_connected_exchanges (Bitfinex only). Symbol format: BTCUSD, ETHUSD, etc. Amount is in base asset (e.g. BTC amount for BTCUSD).",
    parameters: Type.Object({
      summary: Type.String({ description: "Short human-readable summary of the optimization plan" }),
      targetAllocation: Type.Optional(
        Type.Record(Type.String(), Type.Number(), {
          description: "Target % by currency after rebalance, e.g. { BTC: 40, ETH: 30, USD: 30 }",
        }),
      ),
      trades: Type.Array(
        Type.Object({
          exchangeId: Type.String(),
          symbol: Type.String({ description: "Trading pair e.g. BTCUSD" }),
          side: Type.Union([Type.Literal("buy"), Type.Literal("sell")]),
          amount: Type.Number({ description: "Base asset quantity, must be positive" }),
          orderType: Type.Optional(Type.Union([Type.Literal("market"), Type.Literal("limit")])),
          price: Type.Optional(Type.Number()),
          rationale: Type.Optional(Type.String()),
        }),
        { minItems: 1 },
      ),
    }),
    execute: async (_toolCallId, params) => {
      const proposal = await createProposal(
        clientId,
        params.summary,
        params.trades as ProposedTrade[],
        params.targetAllocation,
      );

      notify({
        type: "trade_proposal",
        proposal: {
          proposalId: proposal.id,
          summary: proposal.summary,
          trades: proposal.trades,
          targetAllocation: proposal.targetAllocation,
          expiresAt: proposal.expiresAt,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Trade proposal created (${proposal.trades.length} order(s)). Waiting for user approval in the app.\n\nSummary: ${params.summary}\nProposal ID: ${proposal.id}\n\nTell the user to review and click "Approve & Execute" — nothing runs until they confirm.`,
          },
        ],
        details: { proposalId: proposal.id },
      };
    },
  });

  return {
    tools: [
      getPortfolioSummary,
      getPortfolioInsights,
      getConnectedExchanges,
      getCurrentAppContext,
      proposePortfolioTrades,
    ],
    toolNames: [
      "get_portfolio_summary",
      "get_portfolio_insights",
      "get_connected_exchanges",
      "get_current_app_context",
      "propose_portfolio_trades",
    ] as const,
  };
}

export const PORTFOLIO_SYSTEM_PROMPT = `You are a portfolio management assistant for Portfolio Manager, a multi-exchange crypto portfolio tracker (Bitfinex + Hyperliquid).

Your job:
- Analyze holdings, allocation, and risk using portfolio tools
- Optimize allocation when asked: compare current vs sensible targets, then propose concrete trades
- Use propose_portfolio_trades for Bitfinex rebalancing — user must approve before execution
- Be concise, actionable, and risk-aware
- Never recommend specific price targets; use market orders unless user asks for limits
- Explain rationale for each proposed trade
- Hyperliquid is read-only for now — only propose trades on Bitfinex (check tradable: true)

Optimization workflow:
1. get_portfolio_summary + get_portfolio_insights + get_connected_exchanges
2. Identify concentration, stablecoin drift, or user-stated targets
3. Calculate specific buy/sell amounts in base asset units
4. propose_portfolio_trades with clear summary — wait for user approval
5. After user approves, summarize what was executed (they will tell you or you'll see confirmation)

Guidelines:
- Prefer gradual rebalancing (multiple smaller trades vs one huge swap)
- Respect available balances on sells
- Mention risks: market impact, slippage, tax implications
- Do not claim trades executed until user confirms approval`;
