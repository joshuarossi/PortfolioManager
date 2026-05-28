import { verifyMessage, getAddress } from "viem";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const challenges = new Map<string, { message: string; expiresAt: number }>();

export function buildConnectMessage(address: string, timestamp: number): string {
  return [
    "Portfolio Manager — Connect Hyperliquid",
    "",
    `Address: ${getAddress(address)}`,
    `Timestamp: ${timestamp}`,
    "",
    "Sign to verify wallet ownership. This does not authorize transactions.",
  ].join("\n");
}

export function createChallenge(address: string): { message: string; timestamp: number } {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid wallet address");
  }

  const normalized = getAddress(address);
  const timestamp = Date.now();
  const message = buildConnectMessage(normalized, timestamp);

  challenges.set(normalized.toLowerCase(), {
    message,
    expiresAt: timestamp + CHALLENGE_TTL_MS,
  });

  return { message, timestamp };
}

export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: `0x${string}`,
): Promise<boolean> {
  const normalized = getAddress(address);
  const key = normalized.toLowerCase();
  const challenge = challenges.get(key);

  if (!challenge || challenge.message !== message) {
    return false;
  }

  if (Date.now() > challenge.expiresAt) {
    challenges.delete(key);
    return false;
  }

  const valid = await verifyMessage({
    address: normalized,
    message,
    signature,
  });

  if (valid) challenges.delete(key);
  return valid;
}

export function maskAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
