import { createWalletClient, custom, getAddress, type Address } from "viem";
import { mainnet } from "viem/chains";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

export function hasMetaMask(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function connectMetaMask(): Promise<Address> {
  if (!window.ethereum) {
    throw new Error("MetaMask not found. Install the extension to connect Hyperliquid.");
  }

  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts[0]) {
    throw new Error("No account selected");
  }

  return getAddress(accounts[0]);
}

export async function signMessage(address: Address, message: string): Promise<`0x${string}`> {
  if (!window.ethereum) {
    throw new Error("MetaMask not available");
  }

  const client = createWalletClient({
    chain: mainnet,
    transport: custom(window.ethereum),
  });

  return client.signMessage({ account: address, message });
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
