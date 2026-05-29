import { Hono } from "hono";
import { db } from "../db";
import { exchanges } from "../db/schema";
import { encrypt, maskSecret } from "../services/crypto";
import { testConnection as testBitfinex } from "../services/bitfinex";
import { testConnection as testHyperliquid, isValidAddress } from "../services/hyperliquid";
import {
  createChallenge,
  verifyWalletSignature,
  maskAddress,
} from "../services/wallet";
import { syncExchange } from "../services/portfolio";
import { triggerSync } from "../services/sync-scheduler";
import { disconnectExchange, refreshBitfinexAccountStreams } from "../services/bitfinex-account-stream";
import { eq } from "drizzle-orm";
import { getAddress } from "viem";

const app = new Hono();

app.get("/", async (c) => {
  const all = await db.select().from(exchanges);
  return c.json(
    all.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      label: e.label,
      isActive: e.isActive,
      lastSyncedAt: e.lastSyncedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      walletAddress: e.walletAddress ? maskAddress(e.walletAddress) : null,
      apiKeyMasked: e.apiKeyEncrypted ? maskSecret("••••••••") : null,
    })),
  );
});

app.get("/wallet/challenge", (c) => {
  const address = c.req.query("address");
  if (!address || !isValidAddress(address)) {
    return c.json({ error: "Valid wallet address required" }, 400);
  }

  try {
    const { message, timestamp } = createChallenge(address);
    return c.json({ message, timestamp });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to create challenge" },
      400,
    );
  }
});

app.post("/", async (c) => {
  const body = await c.req.json<{
    type: string;
    label: string;
    apiKey?: string;
    apiSecret?: string;
    walletAddress?: string;
    signature?: string;
    message?: string;
  }>();

  if (!body.type || !body.label) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const id = crypto.randomUUID();

  if (body.type === "bitfinex") {
    if (!body.apiKey || !body.apiSecret) {
      return c.json({ error: "API key and secret required for Bitfinex" }, 400);
    }

    try {
      const test = await testBitfinex(body.apiKey, body.apiSecret);
      if (!test.ok) {
        return c.json({ error: "Failed to connect to Bitfinex" }, 400);
      }
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Connection test failed" },
        400,
      );
    }

    const [created] = await db
      .insert(exchanges)
      .values({
        id,
        name: "Bitfinex",
        type: body.type,
        label: body.label,
        apiKeyEncrypted: await encrypt(body.apiKey),
        apiSecretEncrypted: await encrypt(body.apiSecret),
      })
      .returning();

    void triggerSync("New exchange sync").catch(() => {});
    void refreshBitfinexAccountStreams().catch(() => {});

    return c.json(formatExchange(created), 201);
  }

  if (body.type === "hyperliquid") {
    if (!body.walletAddress || !body.signature || !body.message) {
      return c.json(
        { error: "Wallet address, signature, and message required for Hyperliquid" },
        400,
      );
    }

    if (!isValidAddress(body.walletAddress)) {
      return c.json({ error: "Invalid wallet address" }, 400);
    }

    const normalized = getAddress(body.walletAddress);
    const valid = await verifyWalletSignature(
      normalized,
      body.message,
      body.signature as `0x${string}`,
    );

    if (!valid) {
      return c.json({ error: "Invalid or expired wallet signature" }, 401);
    }

    try {
      await testHyperliquid(normalized);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to reach Hyperliquid" },
        400,
      );
    }

    const [created] = await db
      .insert(exchanges)
      .values({
        id,
        name: "Hyperliquid",
        type: body.type,
        label: body.label,
        walletAddress: normalized,
      })
      .returning();

    void triggerSync("New exchange sync").catch(() => {});

    return c.json(formatExchange(created), 201);
  }

  return c.json({ error: "Unsupported exchange type" }, 400);
});

function formatExchange(exchange: typeof exchanges.$inferSelect) {
  return {
    id: exchange.id,
    name: exchange.name,
    type: exchange.type,
    label: exchange.label,
    isActive: exchange.isActive,
    lastSyncedAt: exchange.lastSyncedAt?.toISOString() ?? null,
    createdAt: exchange.createdAt.toISOString(),
    walletAddress: exchange.walletAddress ? maskAddress(exchange.walletAddress) : null,
  };
}

app.post("/:id/sync", async (c) => {
  const id = c.req.param("id");
  try {
    const wallets = await syncExchange(id);
    return c.json({ success: true, walletCount: wallets.length, wallets });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      500,
    );
  }
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  disconnectExchange(id);
  await db.delete(exchanges).where(eq(exchanges.id, id));
  return c.json({ success: true });
});

app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ label?: string; isActive?: boolean }>();

  const updates: Partial<{ label: string; isActive: boolean }> = {};
  if (body.label != null) updates.label = body.label;
  if (body.isActive != null) updates.isActive = body.isActive;

  await db.update(exchanges).set(updates).where(eq(exchanges.id, id));
  void refreshBitfinexAccountStreams().catch(() => {});
  return c.json({ success: true });
});

export default app;
