import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const exchanges = sqliteTable("exchanges", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // bitfinex, hyperliquid
  label: text("label").notNull(),
  apiKeyEncrypted: text("api_key_encrypted"),
  apiSecretEncrypted: text("api_secret_encrypted"),
  walletAddress: text("wallet_address"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const balanceSnapshots = sqliteTable("balance_snapshots", {
  id: text("id").primaryKey(),
  exchangeId: text("exchange_id")
    .notNull()
    .references(() => exchanges.id, { onDelete: "cascade" }),
  walletType: text("wallet_type").notNull(),
  currency: text("currency").notNull(),
  balance: real("balance").notNull(),
  availableBalance: real("available_balance"),
  usdValue: real("usd_value"),
  capturedAt: integer("captured_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const portfolioSnapshots = sqliteTable("portfolio_snapshots", {
  id: text("id").primaryKey(),
  totalUsdValue: real("total_usd_value").notNull(),
  breakdown: text("breakdown").notNull(), // JSON
  capturedAt: integer("captured_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Exchange = typeof exchanges.$inferSelect;
export type BalanceSnapshot = typeof balanceSnapshots.$inferSelect;
export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
