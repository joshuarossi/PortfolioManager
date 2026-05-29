import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, DollarSign, Coins, Building2, ArrowRight } from "lucide-react";
import { api, formatUsd, formatRelativeTime, type PortfolioSummary, type AiInsight } from "../lib/api";
import { StatCard, Badge, LoadingSpinner } from "../components/ui";
import { PortfolioChart, AllocationChart } from "../components/PortfolioChart";

export default function Dashboard() {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [history, setHistory] = useState<{ date: string; totalUsdValue: number }[]>([]);
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, h, i] = await Promise.all([
        api.getPortfolio(),
        api.getPortfolioHistory(30),
        api.getInsights(),
      ]);
      setPortfolio(p);
      setHistory(h);
      setInsights(i.filter((ins) => ins.severity !== "low" || ins.type === "info").slice(0, 4));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { portfolio: p } = await api.syncAll();
      setPortfolio(p);
      const h = await api.getPortfolioHistory(30);
      setHistory(h);
      const i = await api.getInsights();
      setInsights(i.filter((ins) => ins.severity !== "low" || ins.type === "info").slice(0, 4));
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const currencies = Object.keys(portfolio?.byCurrency ?? {}).length;
  const exchanges = Object.keys(portfolio?.byExchange ?? {}).length;
  const allocation = Object.entries(portfolio?.byCurrency ?? {})
    .map(([name, v]) => ({ name, value: v.usdValue }))
    .sort((a, b) => b.value - a.value);

  const change =
    history.length >= 2
      ? history[history.length - 1].totalUsdValue - history[0].totalUsdValue
      : 0;
  const changePct =
    history.length >= 2 && history[0].totalUsdValue > 0
      ? (change / history[0].totalUsdValue) * 100
      : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-100">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-500">
            {portfolio?.lastUpdated
              ? `Last updated ${formatRelativeTime(portfolio.lastUpdated)}`
              : "Connect an exchange to get started"}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn-primary"
          data-spotlight="sync-all"
          data-ui-label="Sync All"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync All"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          spotlightId="stat-total-value"
          label="Total Portfolio Value"
          value={formatUsd(portfolio?.totalUsdValue ?? 0)}
          sub={
            history.length >= 2
              ? `${change >= 0 ? "+" : ""}${formatUsd(change)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%) 30d`
              : undefined
          }
          trend={change > 0 ? "up" : change < 0 ? "down" : "neutral"}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          spotlightId="stat-assets"
          label="Assets"
          value={String(currencies)}
          sub="Unique currencies"
          icon={<Coins className="h-5 w-5" />}
        />
        <StatCard
          spotlightId="stat-exchanges"
          label="Exchanges"
          value={String(exchanges)}
          sub="Connected accounts"
          icon={<Building2 className="h-5 w-5" />}
        />
        <StatCard
          spotlightId="stat-wallets"
          label="Wallets"
          value={String(portfolio?.wallets.length ?? 0)}
          sub="Active balances"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h3 className="mb-4 text-sm font-medium text-gray-300">Portfolio Value (30 days)</h3>
          <PortfolioChart data={history} />
        </div>

        <div className="card">
          <h3 className="mb-4 text-sm font-medium text-gray-300">Allocation</h3>
          <AllocationChart data={allocation} />
        </div>
      </div>

      {insights.length > 0 && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-300">AI Insights</h3>
            <Link to="/assistant" className="btn-ghost text-xs">
              Open Assistant <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {insights.map((insight, i) => (
              <div
                key={i}
                className="rounded-lg border border-surface-border bg-surface p-4"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      insight.severity === "high"
                        ? "danger"
                        : insight.severity === "medium"
                          ? "warning"
                          : "default"
                    }
                  >
                    {insight.severity}
                  </Badge>
                  <span className="text-sm font-medium text-gray-200">{insight.title}</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">{insight.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {portfolio && portfolio.wallets.length > 0 && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-300">Top Holdings</h3>
            <Link to="/portfolio" className="btn-ghost text-xs">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="pb-3 pr-4">Asset</th>
                  <th className="pb-3 pr-4">Exchange</th>
                  <th className="pb-3 pr-4">Wallet</th>
                  <th className="pb-3 pr-4 text-right">Balance</th>
                  <th className="pb-3 text-right">USD Value</th>
                </tr>
              </thead>
              <tbody>
                {[...portfolio.wallets]
                  .sort((a, b) => b.usdValue - a.usdValue)
                  .slice(0, 8)
                  .map((w, i) => (
                    <tr key={i} className="border-b border-surface-border/50">
                      <td className="py-3 pr-4 font-medium text-gray-200">{w.currency}</td>
                      <td className="py-3 pr-4 text-gray-400">{w.exchangeLabel}</td>
                      <td className="py-3 pr-4">
                        <Badge>{w.walletType}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-gray-300">
                        {w.balance.toFixed(6)}
                      </td>
                      <td className="py-3 text-right font-mono text-gray-200">
                        {formatUsd(w.usdValue)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
