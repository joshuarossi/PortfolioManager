import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { getLatestPortfolio } from "../services/portfolio";
import { getInsights } from "../services/ai";
import { getMarketPrices } from "../services/market";
import { createProposal, type ProposedTrade } from "../services/trading";
import { db } from "../db";
import { exchanges } from "../db/schema";
import { listUiCapabilities, resolveRoute } from "./ui-catalog";

export type TradeProposalPayload = {
  proposalId: string;
  summary: string;
  trades: ProposedTrade[];
  targetAllocation?: Record<string, number>;
  expiresAt: number;
};

type NotifyFn = (
  payload:
    | { type: "trade_proposal"; proposal: TradeProposalPayload }
    | { type: "ui_navigate"; route: string }
    | {
        type: "ui_spotlight";
        ref?: string;
        label?: string;
        selector?: string;
        target?: string;
        message?: string;
        route?: string;
      },
) => void;

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
      "Returns the current browser UI context: route, uiSnapshot (interactive elements with ref, label, selector), and capabilities. Call before spotlight_ui to pick the correct ref or label.",
    parameters: Type.Object({}),
    execute: async () => ({
      content: [{ type: "text", text: JSON.stringify(getAppContext(), null, 2) }],
      details: { context: getAppContext() },
    }),
  });

  const navigateApp = defineTool({
    name: "navigate_app",
    label: "Navigate App",
    description:
      "Navigate the user's browser to an app page. Use when they ask to be taken somewhere (e.g. add exchange, portfolio, dashboard). Pass route (e.g. /exchanges) or page key (dashboard, portfolio, exchanges, assistant). Does not highlight UI — use spotlight_ui separately if needed.",
    parameters: Type.Object({
      route: Type.Optional(
        Type.String({ description: "Path e.g. /exchanges, /portfolio, /, /assistant" }),
      ),
      page: Type.Optional(
        Type.String({
          description: "Page key: dashboard, portfolio, exchanges, assistant",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const resolved = resolveRoute(params.route ?? params.page ?? "");
      if (!resolved) {
        const caps = listUiCapabilities();
        return {
          content: [
            {
              type: "text",
              text: `Unknown route or page. Valid pages: ${Object.keys(caps.routes).join(", ")}. Valid paths: ${Object.values(caps.routes).join(", ")}`,
            },
          ],
          isError: true,
        };
      }
      notify({ type: "ui_navigate", route: resolved });
      return {
        content: [
          {
            type: "text",
            text: `Navigating the user to ${resolved}. They can see the page now; use spotlight_ui if you need to point at a specific control.`,
          },
        ],
        details: { route: resolved },
      };
    },
  });

  const spotlightUi = defineTool({
    name: "spotlight_ui",
    label: "Spotlight UI",
    description:
      "Highlight any visible UI element with a short spotlight (auto-dismisses). Call get_current_app_context first — uiSnapshot.elements lists interactive controls AND stat/region cards (kind: region) with ref, label, spotlightId. Prefer ref; or label e.g. 'Connected accounts', 'Exchanges', 'Total Portfolio Value'; or target/spotlightId e.g. stat-exchanges. Optional route navigates first (use / for dashboard).",
    parameters: Type.Object({
      ref: Type.Optional(
        Type.String({
          description: "Element ref from uiSnapshot.elements[].ref (preferred)",
        }),
      ),
      label: Type.Optional(
        Type.String({
          description: "Visible label/text to match, e.g. Add Exchange, Sync",
        }),
      ),
      selector: Type.Optional(
        Type.String({ description: "CSS selector when ref/label unknown" }),
      ),
      target: Type.Optional(
        Type.String({
          description: "data-spotlight or data-ui-spotlight id e.g. stat-exchanges, sync-all, add-exchange",
        }),
      ),
      route: Type.Optional(
        Type.String({ description: "Navigate to this path before highlighting" }),
      ),
      message: Type.Optional(
        Type.String({ description: "Short hint shown in the spotlight popover" }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const hasLocator =
        !!params.ref?.trim() ||
        !!params.label?.trim() ||
        !!params.selector?.trim() ||
        !!params.target?.trim();
      if (!hasLocator) {
        return {
          content: [
            {
              type: "text",
              text: "Provide at least one of: ref (from uiSnapshot), label, selector, or target.",
            },
          ],
          isError: true,
        };
      }

      notify({
        type: "ui_spotlight",
        ref: params.ref,
        label: params.label,
        selector: params.selector,
        target: params.target,
        route: params.route,
        message: params.message,
      });

      const desc =
        params.ref ?? params.label ?? params.selector ?? params.target ?? "element";
      return {
        content: [
          {
            type: "text",
            text: `Highlighting ${desc}${params.message ? `: ${params.message}` : ""}. Spotlight fades after a few seconds.`,
          },
        ],
        details: { ...params },
      };
    },
  });

  const getMarketPricesTool = defineTool({
    name: "get_market_prices",
    label: "Get Market Prices",
    description:
      "Returns live USD prices for crypto symbols from WebSocket feeds (Hyperliquid + Bitfinex). Defaults to portfolio holdings plus BTC/ETH. Use before rebalancing to reason about current market levels.",
    parameters: Type.Object({
      symbols: Type.Optional(
        Type.Array(Type.String(), {
          description: "Symbols to quote e.g. BTC, ETH, SOL. Omit to use portfolio holdings.",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      let symbols = params.symbols?.map((s) => s.toUpperCase());
      if (!symbols?.length) {
        const portfolio = await getLatestPortfolio();
        symbols = [...new Set([...Object.keys(portfolio.byCurrency), "BTC", "ETH"])];
      }
      const result = await getMarketPrices(symbols);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: { market: result },
      };
    },
  });

  const proposePortfolioTrades = defineTool({
    name: "propose_portfolio_trades",
    label: "Propose Portfolio Trades",
    description:
      "Propose a rebalancing plan as specific Bitfinex market/limit orders. The user must approve in the UI before any order executes. Call get_portfolio_summary and get_portfolio_insights first. Use exchangeId from get_connected_exchanges (Bitfinex only). Symbol can be base asset only (BTC, ETH) or a pair — the server auto-picks UST vs USD from wallet balances. Amount is in base asset units.",
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
          symbol: Type.String({ description: "Base asset or pair e.g. BTC, ETH, BTCUSD — quote currency resolved automatically" }),
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
      getMarketPricesTool,
      getConnectedExchanges,
      getCurrentAppContext,
      navigateApp,
      spotlightUi,
      proposePortfolioTrades,
    ],
    toolNames: [
      "get_portfolio_summary",
      "get_portfolio_insights",
      "get_market_prices",
      "get_connected_exchanges",
      "get_current_app_context",
      "navigate_app",
      "spotlight_ui",
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
- Live market prices are available via get_market_prices (WebSocket-fed, updated continuously)
- Hyperliquid is read-only for now — only propose trades on Bitfinex (check tradable: true)
- Bitfinex spot uses EXCHANGE MARKET orders. Quote currency (UST vs wire USD) is chosen automatically from wallet balances — use base symbols like BTC or ETH in proposals

In-app UI guidance (floating assistant is always available):
- navigate_app: when the user wants to go somewhere — pass page key or route path
- spotlight_ui: when pointing at any control or dashboard stat card — get_current_app_context first; use ref, label (e.g. Connected accounts), or target (stat-exchanges); route / for dashboard stats row
- navigate_app and spotlight_ui are independent — use one, both, or neither
- Do not use UI tools for pure data questions

Optimization workflow:
1. get_portfolio_summary + get_portfolio_insights + get_market_prices + get_connected_exchanges
2. Identify concentration, stablecoin drift, or user-stated targets
3. Calculate specific buy/sell amounts in base asset units
4. propose_portfolio_trades with clear summary — wait for user approval
5. After user approves, summarize what was executed (they will tell you or you'll see confirmation)

Guidelines:
- Prefer gradual rebalancing (multiple smaller trades vs one huge swap)
- Respect available balances on sells
- Mention risks: market impact, slippage, tax implications
- Do not claim trades executed until user confirms approval`;
