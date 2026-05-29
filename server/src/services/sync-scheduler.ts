import { syncAllExchanges, getLatestPortfolio } from "./portfolio";
import { watchSymbols } from "./market-stream";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 3_000;

export interface SyncResult {
  results: Awaited<ReturnType<typeof syncAllExchanges>>;
  portfolio: Awaited<ReturnType<typeof getLatestPortfolio>>;
}

let syncPromise: Promise<SyncResult> | null = null;

async function runSync(label: string): Promise<SyncResult> {
  if (syncPromise) {
    console.log(`[sync] ${label} — joining in-progress sync`);
    return syncPromise;
  }

  syncPromise = (async () => {
    try {
      const results = await syncAllExchanges();
      const ok = results.filter((r) => r.success).length;
      console.log(
        `[${new Date().toISOString()}] ${label}: synced ${ok}/${results.length} exchange(s)`,
      );

      const portfolio = await getLatestPortfolio();
      if (ok > 0) {
        watchSymbols(Object.keys(portfolio.byCurrency));
      }

      return { results, portfolio };
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

export function startSyncScheduler() {
  const intervalMs = Number(process.env.SYNC_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);

  setTimeout(() => {
    void runSync("Startup sync").catch((err) => {
      console.error("[sync] Startup sync failed:", err);
    });
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    void runSync("Scheduled sync").catch((err) => {
      console.error("[sync] Scheduled sync failed:", err);
    });
  }, intervalMs);

  console.log(
    `[sync] Auto-sync enabled (every ${Math.round(intervalMs / 1000)}s, startup in ${STARTUP_DELAY_MS / 1000}s)`,
  );
}

export function triggerSync(label = "Manual sync"): Promise<SyncResult> {
  return runSync(label);
}

export function isSyncRunning(): boolean {
  return syncPromise != null;
}
