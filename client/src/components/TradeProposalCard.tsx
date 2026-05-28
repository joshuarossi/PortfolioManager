import { useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { api, type TradeProposalPayload, type TradeExecutionResult } from "../lib/api";
import clsx from "clsx";

interface TradeProposalCardProps {
  proposal: TradeProposalPayload;
  clientId: string;
  onDismiss: () => void;
  onExecuted: (results: TradeExecutionResult[]) => void;
}

export function TradeProposalCard({
  proposal,
  clientId,
  onDismiss,
  onExecuted,
}: TradeProposalCardProps) {
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TradeExecutionResult[] | null>(null);

  const expiresIn = Math.max(0, Math.floor((proposal.expiresAt - Date.now()) / 60000));

  const handleExecute = async () => {
    if (!confirm(`Execute ${proposal.trades.length} trade(s) on Bitfinex? This cannot be undone.`)) {
      return;
    }
    setExecuting(true);
    setError(null);
    try {
      const res = await api.executeTradeProposal(proposal.proposalId, clientId);
      setResults(res.results);
      onExecuted(res.results);
      if (res.success) {
        setTimeout(onDismiss, 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-4 animate-slide-up">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-100">Trade proposal — approval required</h4>
          <p className="mt-1 text-sm text-gray-400">{proposal.summary}</p>
          {proposal.targetAllocation && (
            <p className="mt-2 text-xs text-gray-500">
              Target:{" "}
              {Object.entries(proposal.targetAllocation)
                .map(([c, p]) => `${c} ${p}%`)
                .join(" · ")}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-600">Expires in ~{expiresIn}m</p>

          <div className="mt-3 space-y-2">
            {proposal.trades.map((t, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-xs"
              >
                <span
                  className={clsx(
                    "font-semibold uppercase",
                    t.side === "buy" ? "text-profit" : "text-loss",
                  )}
                >
                  {t.side}
                </span>
                <span className="font-mono text-gray-200">
                  {t.amount} {t.symbol.replace(/USD$|UST$/, "")}
                </span>
                <span className="text-gray-500">{t.orderType ?? "market"}</span>
                {t.rationale && <span className="w-full text-gray-500">{t.rationale}</span>}
              </div>
            ))}
          </div>

          {results && (
            <div className="mt-3 space-y-1">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {r.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-profit" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-loss" />
                  )}
                  <span className={r.success ? "text-gray-400" : "text-loss"}>
                    {r.trade.side} {r.trade.amount} {r.trade.symbol}
                    {r.error ? ` — ${r.error}` : " — submitted"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error && <p className="mt-2 text-xs text-loss">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleExecute}
              disabled={executing || !!results?.every((r) => r.success)}
              className="btn-primary text-xs"
            >
              {executing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Executing…
                </>
              ) : (
                "Approve & Execute"
              )}
            </button>
            <button onClick={onDismiss} disabled={executing} className="btn-secondary text-xs">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
