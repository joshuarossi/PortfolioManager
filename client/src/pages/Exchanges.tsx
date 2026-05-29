import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, RefreshCw, Shield, ExternalLink, Wallet } from "lucide-react";
import { api, formatRelativeTime, type Exchange } from "../lib/api";
import { connectMetaMask, hasMetaMask, signMessage, shortenAddress } from "../lib/wallet";
import { Badge, LoadingSpinner, EmptyState } from "../components/ui";

type ExchangeType = "bitfinex" | "hyperliquid";

const EXCHANGE_META: Record<
  ExchangeType,
  { name: string; abbr: string; color: string; bg: string }
> = {
  bitfinex: { name: "Bitfinex", abbr: "Bf", color: "#16a085", bg: "bg-[#16a085]/20" },
  hyperliquid: { name: "Hyperliquid", abbr: "HL", color: "#50fa7b", bg: "bg-[#50fa7b]/20" },
};

export default function ExchangesPage() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [exchangeType, setExchangeType] = useState<ExchangeType>("hyperliquid");
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [bitfinexForm, setBitfinexForm] = useState({ label: "", apiKey: "", apiSecret: "" });
  const [hyperliquidForm, setHyperliquidForm] = useState({
    label: "",
    address: "",
  });

  const load = useCallback(async () => {
    try {
      const data = await api.getExchanges();
      setExchanges(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForms = () => {
    setBitfinexForm({ label: "", apiKey: "", apiSecret: "" });
    setHyperliquidForm({ label: "", address: "" });
    setError(null);
  };

  const handleBitfinexSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.addBitfinexExchange(bitfinexForm);
      resetForms();
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add exchange");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConnectMetaMask = async () => {
    setError(null);
    try {
      const address = await connectMetaMask();
      setHyperliquidForm((f) => ({
        ...f,
        address,
        label: f.label || `Hyperliquid ${shortenAddress(address)}`,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect MetaMask");
    }
  };

  const handleHyperliquidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hyperliquidForm.address) {
      setError("Connect your wallet first");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const { message } = await api.getWalletChallenge(hyperliquidForm.address);
      const signature = await signMessage(
        hyperliquidForm.address as `0x${string}`,
        message,
      );
      await api.addHyperliquidExchange({
        label: hyperliquidForm.label,
        walletAddress: hyperliquidForm.address,
        signature,
        message,
      });
      resetForms();
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Hyperliquid");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSync = async (id: string) => {
    setSyncing(id);
    try {
      await api.syncExchange(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this exchange connection? Historical data will be deleted.")) return;
    await api.deleteExchange(id);
    await load();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-100">Exchanges</h2>
          <p className="mt-1 text-sm text-gray-500">
            Connect CEX API keys or a Web3 wallet for DEX portfolio tracking
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary"
          data-spotlight="add-exchange"
        >
          <Plus className="h-4 w-4" />
          Add Exchange
        </button>
      </div>

      <div className="card flex items-start gap-3 border-accent/20 bg-accent/5">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <p className="text-sm font-medium text-gray-200">Secure by design</p>
          <p className="mt-1 text-sm text-gray-500">
            Bitfinex API keys are encrypted at rest. Hyperliquid uses MetaMask signature
            verification — only your wallet address is stored, no private keys. Balances are
            fetched via Hyperliquid&apos;s public read API.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          {error}
        </div>
      )}

      {showForm && (
        <div className="card animate-slide-up">
          <div className="mb-6 flex gap-2">
            {(["hyperliquid", "bitfinex"] as ExchangeType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setExchangeType(type)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  exchangeType === type
                    ? "bg-accent text-white"
                    : "bg-surface-overlay text-gray-400 hover:text-gray-200"
                }`}
              >
                {EXCHANGE_META[type].name}
              </button>
            ))}
          </div>

          {exchangeType === "hyperliquid" ? (
            <>
              <h3 className="mb-4 text-lg font-medium text-gray-100">Connect Hyperliquid</h3>
              <form onSubmit={handleHyperliquidSubmit} className="max-w-lg space-y-4">
                <div>
                  <label className="label">Account Label</label>
                  <input
                    className="input"
                    placeholder="My Hyperliquid Wallet"
                    value={hyperliquidForm.label}
                    onChange={(e) =>
                      setHyperliquidForm({ ...hyperliquidForm, label: e.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <label className="label">Wallet</label>
                  {hyperliquidForm.address ? (
                    <div className="flex items-center justify-between rounded-lg border border-surface-border bg-surface px-3 py-2">
                      <span className="font-mono text-sm text-gray-200">
                        {hyperliquidForm.address}
                      </span>
                      <Badge variant="success">Connected</Badge>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConnectMetaMask}
                      disabled={!hasMetaMask()}
                      className="btn-secondary w-full"
                    >
                      <Wallet className="h-4 w-4" />
                      {hasMetaMask() ? "Connect MetaMask" : "MetaMask not detected"}
                    </button>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={submitting || !hyperliquidForm.address}
                    className="btn-primary"
                  >
                    {submitting ? "Verifying..." : "Sign & Connect"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      resetForms();
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>

                <p className="text-xs text-gray-500">
                  You&apos;ll sign a message in MetaMask to prove wallet ownership. Use your
                  main Hyperliquid account address (not an API agent wallet).
                </p>
              </form>
            </>
          ) : (
            <>
              <h3 className="mb-4 text-lg font-medium text-gray-100">Connect Bitfinex</h3>
              <form onSubmit={handleBitfinexSubmit} className="max-w-lg space-y-4">
                <div>
                  <label className="label">Account Label</label>
                  <input
                    className="input"
                    placeholder="My Bitfinex Account"
                    value={bitfinexForm.label}
                    onChange={(e) => setBitfinexForm({ ...bitfinexForm, label: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">API Key</label>
                  <input
                    className="input font-mono"
                    placeholder="Your Bitfinex API key"
                    value={bitfinexForm.apiKey}
                    onChange={(e) => setBitfinexForm({ ...bitfinexForm, apiKey: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">API Secret</label>
                  <input
                    className="input font-mono"
                    type="password"
                    placeholder="Your Bitfinex API secret"
                    value={bitfinexForm.apiSecret}
                    onChange={(e) =>
                      setBitfinexForm({ ...bitfinexForm, apiSecret: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={submitting} className="btn-primary">
                    {submitting ? "Connecting..." : "Connect & Verify"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      resetForms();
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Need API keys?{" "}
                  <a
                    href="https://setting.bitfinex.com/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    Bitfinex API Settings <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </form>
            </>
          )}
        </div>
      )}

      {exchanges.length === 0 && !showForm ? (
        <EmptyState
          title="No exchanges connected"
          description="Connect Bitfinex with API keys or Hyperliquid with your MetaMask wallet to start tracking."
          action={
            <button onClick={() => setShowForm(true)} className="btn-primary">
              <Plus className="h-4 w-4" />
              Add Exchange
            </button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {exchanges.map((exchange) => {
            const meta = EXCHANGE_META[exchange.type as ExchangeType] ?? EXCHANGE_META.bitfinex;
            return (
              <div key={exchange.id} className="card flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold ${meta.bg}`}
                    style={{ color: meta.color }}
                  >
                    {meta.abbr}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-100">{exchange.label}</h3>
                      <Badge variant={exchange.isActive ? "success" : "default"}>
                        {exchange.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500">
                      {exchange.name}
                      {exchange.walletAddress ? ` · ${exchange.walletAddress}` : ""}
                      {" · "}
                      {exchange.lastSyncedAt
                        ? `Synced ${formatRelativeTime(exchange.lastSyncedAt)}`
                        : "Never synced"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSync(exchange.id)}
                    disabled={syncing === exchange.id}
                    className="btn-secondary"
                    data-spotlight="exchange-sync"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${syncing === exchange.id ? "animate-spin" : ""}`}
                    />
                    Sync
                  </button>
                  <button onClick={() => handleDelete(exchange.id)} className="btn-ghost text-loss">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
