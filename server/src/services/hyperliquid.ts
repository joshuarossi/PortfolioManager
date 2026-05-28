const INFO_URL = "https://api.hyperliquid.xyz/info";

export interface HyperliquidWallet {
  type: string;
  currency: string;
  balance: number;
  availableBalance: number | null;
  usdValue: number;
}

interface SpotBalance {
  coin: string;
  total: string;
  hold: string;
}

interface ClearinghouseState {
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
  };
  withdrawable: string;
  assetPositions: {
    position: {
      coin: string;
      szi: string;
      positionValue: string;
      unrealizedPnl: string;
      entryPx: string;
    };
  }[];
}

async function infoRequest<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hyperliquid API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

async function fetchAllMids(): Promise<Map<string, number>> {
  const mids = await infoRequest<Record<string, string>>({ type: "allMids" });
  const prices = new Map<string, number>();
  for (const [coin, price] of Object.entries(mids)) {
    prices.set(coin, parseFloat(price));
  }
  prices.set("USDC", 1);
  prices.set("USD", 1);
  return prices;
}

function priceUsd(coin: string, prices: Map<string, number>): number {
  if (coin === "USDC" || coin === "USD") return 1;
  return prices.get(coin) ?? 0;
}

export async function fetchWallets(walletAddress: string): Promise<HyperliquidWallet[]> {
  const address = walletAddress.toLowerCase();
  const [spotState, perpState, prices] = await Promise.all([
    infoRequest<{ balances: SpotBalance[] }>({
      type: "spotClearinghouseState",
      user: address,
    }),
    infoRequest<ClearinghouseState>({
      type: "clearinghouseState",
      user: address,
    }),
    fetchAllMids(),
  ]);

  const wallets: HyperliquidWallet[] = [];

  for (const bal of spotState.balances ?? []) {
    const total = parseFloat(bal.total);
    const hold = parseFloat(bal.hold);
    if (Math.abs(total) < 1e-10) continue;

    const px = priceUsd(bal.coin, prices);
    wallets.push({
      type: "spot",
      currency: bal.coin,
      balance: total,
      availableBalance: total - hold,
      usdValue: total * px,
    });
  }

  for (const { position } of perpState.assetPositions ?? []) {
    const size = parseFloat(position.szi);
    if (Math.abs(size) < 1e-10) continue;

    const positionValue = parseFloat(position.positionValue);
    wallets.push({
      type: "perp",
      currency: position.coin,
      balance: size,
      availableBalance: null,
      usdValue: Math.abs(positionValue),
    });
  }

  const accountValue = parseFloat(perpState.marginSummary?.accountValue ?? "0");
  const withdrawable = parseFloat(perpState.withdrawable ?? "0");
  const hasPerpPositions = (perpState.assetPositions ?? []).some(
    (p) => Math.abs(parseFloat(p.position.szi)) > 1e-10,
  );

  // Account equity row when perp margin is in use but not fully represented by spot USDC
  if (accountValue > 0 && hasPerpPositions) {
    wallets.push({
      type: "perp-equity",
      currency: "USD",
      balance: accountValue,
      availableBalance: withdrawable,
      usdValue: accountValue,
    });
  }

  return wallets;
}

export async function testConnection(
  walletAddress: string,
): Promise<{ ok: boolean; walletCount: number; accountValue: number }> {
  const wallets = await fetchWallets(walletAddress);
  const accountValue = wallets.reduce((sum, w) => {
    if (w.type === "perp-equity") return sum + w.usdValue;
    if (w.type === "perp") return sum;
    return sum + w.usdValue;
  }, 0);

  return { ok: true, walletCount: wallets.length, accountValue };
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
