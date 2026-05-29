import clsx from "clsx";
import { usePriceTicker, type TickerEntry } from "../hooks/usePriceTicker";

function formatTickerPrice(price: number): string {
  if (price >= 10_000) {
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (price >= 1) {
    return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${price.toFixed(4)}`;
}

function formatCompactVolume(volume: number): string {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return volume.toFixed(0);
}

function TickerItem({ entry }: { entry: TickerEntry }) {
  return (
    <div
      className={clsx(
        "flex shrink-0 items-center gap-3 border-r border-surface-border/60 pr-4 last:border-r-0",
        entry.change === "up" && "text-profit",
        entry.change === "down" && "text-loss",
        entry.change === "flat" && "text-gray-300",
      )}
    >
      <span className="font-sans text-xs font-medium text-gray-400">{entry.symbol}</span>
      <span className="font-mono text-xs">{formatTickerPrice(entry.price)}</span>
      {entry.bid != null && entry.ask != null && (
        <span className="font-mono text-[11px] text-gray-500">
          {formatTickerPrice(entry.bid)} / {formatTickerPrice(entry.ask)}
        </span>
      )}
      {entry.volume != null && (
        <span className="font-mono text-[11px] text-gray-600">
          vol {formatCompactVolume(entry.volume)}
        </span>
      )}
    </div>
  );
}

export default function PriceTicker() {
  const { entries, loading } = usePriceTicker();

  if (loading) {
    return (
      <div className="flex min-h-9 items-center border-b border-surface-border bg-surface-raised/60 px-6">
        <span className="text-xs text-gray-600">Loading market data…</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return null;
  }

  return (
    <div
      className="border-b border-surface-border bg-surface-raised/60 px-6 py-2"
      aria-label="Live asset prices"
    >
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {entries.map((entry) => (
          <TickerItem key={entry.symbol} entry={entry} />
        ))}
      </div>
    </div>
  );
}
