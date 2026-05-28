import { getLatestPortfolio, type PortfolioSummary } from "./portfolio";

export interface AiInsight {
  type: "rebalance" | "concentration" | "diversification" | "action" | "info";
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  suggestion?: string;
}

function analyzePortfolio(portfolio: PortfolioSummary): AiInsight[] {
  const insights: AiInsight[] = [];
  const { totalUsdValue, byCurrency, wallets } = portfolio;

  if (totalUsdValue === 0) {
    insights.push({
      type: "info",
      title: "No portfolio data",
      description: "Connect an exchange and sync to get AI-powered insights.",
      severity: "low",
    });
    return insights;
  }

  const sorted = Object.entries(byCurrency).sort((a, b) => b[1].usdValue - a[1].usdValue);
  const top = sorted[0];

  if (top) {
    const concentration = (top[1].usdValue / totalUsdValue) * 100;
    if (concentration > 60) {
      insights.push({
        type: "concentration",
        title: `High ${top[0]} concentration`,
        description: `${top[0]} represents ${concentration.toFixed(1)}% of your portfolio ($${top[1].usdValue.toLocaleString()}).`,
        severity: concentration > 80 ? "high" : "medium",
        suggestion: `Consider diversifying by reducing ${top[0]} exposure to below 50% of total portfolio value.`,
      });
    }
  }

  const stablecoins = ["USD", "USDT", "UST", "USDC", "DAI"];
  const stableValue = sorted
    .filter(([c]) => stablecoins.includes(c))
    .reduce((s, [, v]) => s + v.usdValue, 0);
  const stablePct = (stableValue / totalUsdValue) * 100;

  if (stablePct > 70) {
    insights.push({
      type: "diversification",
      title: "High stablecoin allocation",
      description: `${stablePct.toFixed(1)}% of your portfolio is in stablecoins.`,
      severity: "medium",
      suggestion: "Consider deploying some stablecoin reserves into diversified crypto assets based on your risk tolerance.",
    });
  } else if (stablePct < 5 && totalUsdValue > 1000) {
    insights.push({
      type: "rebalance",
      title: "Low cash reserves",
      description: `Only ${stablePct.toFixed(1)}% is held in stablecoins for liquidity.`,
      severity: "medium",
      suggestion: "Maintaining 10-20% in stablecoins can provide flexibility for rebalancing and opportunistic buys.",
    });
  }

  const marginWallets = wallets.filter(
    (w) => (w.walletType === "margin" || w.walletType === "perp") && w.balance !== 0,
  );
  if (marginWallets.length > 0) {
    const marginValue = marginWallets.reduce((s, w) => s + w.usdValue, 0);
    insights.push({
      type: "action",
      title: "Active leveraged positions",
      description: `You have ${marginWallets.length} margin/perp position(s) with ~$${Math.abs(marginValue).toLocaleString()} in exposure.`,
      severity: "high",
      suggestion: "Review leveraged positions regularly. Consider reducing leverage in volatile markets.",
    });
  }

  if (sorted.length >= 3) {
    const topThreePct =
      (sorted.slice(0, 3).reduce((s, [, v]) => s + v.usdValue, 0) / totalUsdValue) * 100;
    if (topThreePct < 90 && sorted.length >= 5) {
      insights.push({
        type: "diversification",
        title: "Well diversified",
        description: `Your top 3 assets account for ${topThreePct.toFixed(1)}% — good spread across ${sorted.length} assets.`,
        severity: "low",
      });
    }
  }

  insights.push({
    type: "info",
    title: "Portfolio snapshot",
    description: `Total value: $${totalUsdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} across ${Object.keys(byCurrency).length} currencies on ${new Set(wallets.map((w) => w.exchangeId)).size} exchange(s).`,
    severity: "low",
  });

  return insights;
}

export async function getInsights(): Promise<AiInsight[]> {
  const portfolio = await getLatestPortfolio();
  return analyzePortfolio(portfolio);
}
