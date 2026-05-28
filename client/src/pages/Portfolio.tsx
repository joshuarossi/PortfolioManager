import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { api, formatUsd, type PortfolioSummary, type Exchange } from "../lib/api";
import { Badge, LoadingSpinner, EmptyState } from "../components/ui";
import { Link } from "react-router-dom";

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [connectedExchanges, setConnectedExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const [p, exchanges] = await Promise.all([api.getPortfolio(), api.getExchanges()]);
      setPortfolio(p);
      setConnectedExchanges(exchanges.filter((e) => e.isActive));
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
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (!portfolio || portfolio.wallets.length === 0) {
    const hasExchanges = connectedExchanges.length > 0;

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-gray-100">Portfolio</h2>
        <EmptyState
          title={hasExchanges ? "No balances synced yet" : "No balances yet"}
          description={
            hasExchanges
              ? `You have ${connectedExchanges.length} exchange${connectedExchanges.length === 1 ? "" : "s"} connected (${connectedExchanges.map((e) => e.name).join(", ")}). Sync to pull your latest holdings.`
              : "Connect Bitfinex or Hyperliquid, then sync to see your holdings across wallets and currencies."
          }
          action={
            hasExchanges ? (
              <button onClick={handleSync} disabled={syncing} className="btn-primary">
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing..." : "Sync All"}
              </button>
            ) : (
              <Link to="/exchanges" className="btn-primary">
                Connect Exchange
              </Link>
            )
          }
        />
      </div>
    );
  }

  const currencies = [...new Set(portfolio.wallets.map((w) => w.currency))];
  const filtered =
    filter === "all" ? portfolio.wallets : portfolio.wallets.filter((w) => w.currency === filter);

  const grouped = Object.entries(portfolio.byCurrency).sort(
    (a, b) => b[1].usdValue - a[1].usdValue,
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-100">Portfolio</h2>
          <p className="mt-1 text-sm text-gray-500">
            Total value: {formatUsd(portfolio.totalUsdValue)}
          </p>
        </div>
        <button onClick={load} className="btn-secondary">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {grouped.map(([currency, data]) => {
          const pct = (data.usdValue / portfolio.totalUsdValue) * 100;
          return (
            <button
              key={currency}
              onClick={() => setFilter(filter === currency ? "all" : currency)}
              className={`card text-left transition-all hover:border-accent/50 ${
                filter === currency ? "border-accent ring-1 ring-accent/30" : ""
              }`}
            >
              <p className="text-lg font-semibold text-gray-100">{currency}</p>
              <p className="mt-1 font-mono text-sm text-gray-400">{data.balance.toFixed(6)}</p>
              <p className="mt-2 text-sm text-gray-300">{formatUsd(data.usdValue)}</p>
              <div className="mt-2 h-1.5 rounded-full bg-surface-border">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">{pct.toFixed(1)}%</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filter === "all"
              ? "bg-accent text-white"
              : "bg-surface-overlay text-gray-400 hover:text-gray-200"
          }`}
        >
          All
        </button>
        {currencies.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === c
                ? "bg-accent text-white"
                : "bg-surface-overlay text-gray-400 hover:text-gray-200"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="pb-3 pr-4">Asset</th>
              <th className="pb-3 pr-4">Exchange</th>
              <th className="pb-3 pr-4">Wallet Type</th>
              <th className="pb-3 pr-4 text-right">Balance</th>
              <th className="pb-3 pr-4 text-right">Available</th>
              <th className="pb-3 text-right">USD Value</th>
            </tr>
          </thead>
          <tbody>
            {[...filtered]
              .sort((a, b) => b.usdValue - a.usdValue)
              .map((w, i) => (
                <tr key={i} className="border-b border-surface-border/50 hover:bg-surface/50">
                  <td className="py-3 pr-4">
                    <span className="font-medium text-gray-200">{w.currency}</span>
                  </td>
                  <td className="py-3 pr-4 text-gray-400">{w.exchangeLabel}</td>
                  <td className="py-3 pr-4">
                    <Badge>{w.walletType}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-gray-300">
                    {w.balance.toFixed(8)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-gray-500">
                    {w.availableBalance != null ? w.availableBalance.toFixed(8) : "—"}
                  </td>
                  <td className="py-3 text-right font-mono font-medium text-gray-200">
                    {formatUsd(w.usdValue)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
