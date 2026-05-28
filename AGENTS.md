# AGENTS.md — Portfolio Manager

Guidance for AI coding agents and human contributors working on this repository.

---

## Project summary

**Portfolio Manager** is a Bun monorepo for personal crypto portfolio tracking and AI-assisted rebalancing.

| Package | Role | Stack |
|---------|------|-------|
| `server/` | REST API, WebSocket pi agent, exchange sync, trade execution | Bun, Hono, Drizzle, SQLite, `@earendil-works/pi-coding-agent` |
| `client/` | SPA dashboard | Vite, React 19, TypeScript, Tailwind, Recharts |

**Core user flows:**

1. Connect exchanges → sync balances → view dashboard/history
2. Chat with pi WebSocket agent → get analysis → approve Bitfinex trade proposals

There is **no user auth** yet. Treat this as a single-user local/trusted deployment.

---

## Repository layout

```
server/src/
  index.ts                 # Hono routes + Bun WebSocket on /api/agent
  agent/
    ws-handler.ts          # pi session: create, message, dispose
    portfolio-tools.ts     # Custom pi tools + PORTFOLIO_SYSTEM_PROMPT
  db/schema.ts             # Source of truth for SQLite schema
  routes/                  # Thin Hono handlers — delegate to services
  services/
    bitfinex.ts            # Bitfinex REST v2 (wallets, tickers, submitOrder)
    hyperliquid.ts         # HL /info read API (spot + perp)
    portfolio.ts           # Sync, snapshots, getLatestPortfolio
    trading.ts             # Trade proposals + Bitfinex execution
    ai.ts                  # Rule-based insights (no LLM)
    crypto.ts              # AES-GCM encrypt/decrypt for API keys
    wallet.ts              # EIP-191 MetaMask verification

client/src/
  pages/                   # Route-level components
  hooks/usePiAgent.ts      # WebSocket client; handles trade_proposal events
  lib/api.ts               # REST fetch wrapper + types
  components/
    TradeProposalCard.tsx  # Human approval UI for AI trades
    MarkdownMessage.tsx    # Assistant markdown rendering
```

**Do not edit** generated SQL in `server/drizzle/` by hand — run `bun run db:generate` after schema changes.

---

## Commands

Run from **repo root** unless noted.

| Command | Purpose |
|---------|---------|
| `bun install` | Install all workspace deps |
| `bun run dev` | Server (:3001) + client (:5173) via concurrently |
| `bun run build` | Production build (client + server) |
| `bun run start` | Run built server |
| `bun run db:generate` | Drizzle: schema → SQL migration |
| `bun run db:migrate` | Apply migrations to SQLite |
| `cd client && bun run build` | Typecheck + Vite build |

Environment: copy `.env.example` → `.env` at repo root. Bun loads it when starting the server.

---

## Architecture principles

### 1. Services own business logic

- **Routes** parse input, call services, return JSON. Keep them thin.
- **Services** talk to DB, exchanges, and each other. No HTTP concerns.
- **Agent tools** in `portfolio-tools.ts` should call services, not duplicate logic.

### 2. Exchange adapter pattern

Each exchange type is handled in `portfolio.ts` → `fetchExchangeWallets()`:

```typescript
if (exchange.type === "bitfinex") { /* decrypt keys → bitfinex.fetchWallets */ }
if (exchange.type === "hyperliquid") { /* walletAddress → hyperliquid.fetchWallets */ }
```

To add an exchange:

1. Add type string to schema comment + validation in `routes/exchanges.ts`
2. Create `services/<exchange>.ts` with `fetchWallets`, optionally `testConnection`
3. Extend `fetchExchangeWallets` in `portfolio.ts`
4. Add client form in `pages/Exchanges.tsx`
5. Update `EXCHANGE_META` and API types in `lib/api.ts`

### 3. pi agent is WebSocket-first

The Assistant page uses **`usePiAgent`** → `WS /api/agent?clientId=...`.

- Sessions persist under `.portfolio-manager/sessions/{clientId}/` via pi `SessionManager.continueRecent`
- Custom tools are registered in `createPortfolioTools(clientId, notify)`
- Tools that need to push UI state call `notify({ type: "trade_proposal", ... })` — the client must handle new message types in `usePiAgent.ts`

**Reference implementation:** `/Users/joshrossi/Code/pi-web/server/index.ts` (scheduling demo with `ui_action` pattern). This project uses `trade_proposal` instead.

Do **not** reintroduce REST `/api/ai/chat` unless there is a clear reason — the WebSocket path is canonical.

### 4. Trading safety

All automated trading must follow:

1. AI proposes via `propose_portfolio_trades` tool
2. `trading.createProposal()` validates balances, exchange type, max USD
3. Client shows `TradeProposalCard` — user confirms
4. `POST /api/trades/proposals/:id/execute` with matching `clientId`
5. `trading.executeProposal()` runs orders, syncs affected exchanges

**Never** execute trades from the agent tool directly. **Never** skip user confirmation.

Bitfinex order amounts: positive = buy, negative = sell (see `bitfinex.submitOrder`).

---

## Key files to read before changing…

| Task | Read first |
|------|------------|
| AI behavior / tools | `server/src/agent/portfolio-tools.ts` |
| WebSocket protocol | `server/src/agent/ws-handler.ts`, `client/src/hooks/usePiAgent.ts` |
| Trade flow | `server/src/services/trading.ts`, `client/src/components/TradeProposalCard.tsx` |
| Portfolio sync | `server/src/services/portfolio.ts` |
| Bitfinex API | `server/src/services/bitfinex.ts` |
| Hyperliquid read API | `server/src/services/hyperliquid.ts` |
| DB schema | `server/src/db/schema.ts` |
| Client API types | `client/src/lib/api.ts` |

---

## Coding conventions

### TypeScript

- Strict mode on client; match existing patterns (interfaces in `lib/api.ts`, services export typed functions)
- Prefer `async/await`; use Hono's `c.json()` for responses
- ESM throughout (`"type": "module"`)

### Naming

- Exchange `type`: lowercase slug (`bitfinex`, `hyperliquid`)
- Route files: plural resource (`exchanges.ts`, `trades.ts`)
- Service files: singular domain (`portfolio.ts`, `trading.ts`)

### Styling (client)

- Tailwind utility classes; shared primitives in `components/ui.tsx` (`.btn-primary`, `.card`, `.input`)
- Dark theme tokens: `surface`, `accent`, `profit`, `loss` in `tailwind.config.js`

### Comments

- Only for non-obvious business rules (e.g. Bitfinex signed amounts, HL master vs agent wallet)
- Don't add narrating comments

### Scope

- Minimal diffs — don't refactor unrelated code in feature PRs
- Don't add tests unless asked (project has no test harness yet)

---

## Database

**ORM:** Drizzle + `bun:sqlite`

**Workflow:**

1. Edit `server/src/db/schema.ts`
2. `bun run db:generate`
3. Review new file in `server/drizzle/`
4. `bun run db:migrate`

**Tables:**

- `exchanges` — nullable `api_key_encrypted` / `api_secret_encrypted` for Bitfinex; `wallet_address` for Hyperliquid
- `balance_snapshots` — time-series per wallet/currency
- `portfolio_snapshots` — aggregate USD + JSON breakdown
- `ai_conversations` / `ai_messages` — legacy; WebSocket agent uses pi session files instead

Deleting an exchange cascades to its balance snapshots.

---

## Environment variables

| Variable | Used by |
|----------|---------|
| `PORT`, `DATABASE_URL` | `server/src/index.ts`, `server/src/db/index.ts` |
| `ENCRYPTION_KEY` | `server/src/services/crypto.ts` |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` | `server/src/agent/ws-handler.ts` → pi AuthStorage |
| `PI_MODEL` | pi model override (if wired in pi-assistant.ts / registry) |
| `TRADE_MAX_USD_PER_ORDER` | `server/src/services/trading.ts` |

Never log or commit secrets. Warn users if they try to commit `.env`.

---

## Adding a pi agent tool

1. Define tool in `server/src/agent/portfolio-tools.ts` using `defineTool` + TypeBox params
2. Add to `tools` array and `toolNames` in return value
3. If it pushes UI state, extend `NotifyFn` type and handle in `client/src/hooks/usePiAgent.ts`
4. Update `PORTFOLIO_SYSTEM_PROMPT` with when/how to use the tool
5. List tool in `buildAppContext` capabilities in `usePiAgent.ts` (optional but helpful)

Restart server after server-side tool changes (Bun watch handles this in dev).

---

## Adding Hyperliquid trading (future)

Hyperliquid trading requires:

- API agent wallet keypair (generated in HL UI — **not** MetaMask main key)
- Encrypted storage for agent private key (new schema column or separate table)
- Signed POST to `https://api.hyperliquid.xyz/exchange`
- Same propose → approve → execute pattern as Bitfinex

Read-only HL integration is complete; do not conflate wallet verification with trade signing.

---

## Common pitfalls

| Issue | Cause / fix |
|-------|-------------|
| WebSocket agent error `normalized.startsWith` | `DefaultResourceLoader` needs `agentDir: getAgentDir()` |
| Empty Hyperliquid balances | User connected API agent address instead of master wallet |
| AI says it can't trade | Only Bitfinex has `tradable: true`; HL is read-only |
| Trades fail on execute | Bitfinex key missing **Orders** permission; or proposal expired |
| Portfolio shows $0 | Exchange connected but never synced — click Sync |
| pi "no models available" | Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env` |
| Client can't reach API | Ensure `bun run dev` runs both; Vite proxies `/api` with `ws: true` |

---

## Git / commits

- Do not commit unless explicitly asked
- Never commit: `.env`, `*.db`, `.portfolio-manager/`, `node_modules/`, `dist/`
- User prefers focused commits with clear "why" messages

---

## Testing manually

1. **Without Bitfinex:** Connect Hyperliquid → Sync → Dashboard shows HL balances; AI can analyze but cannot propose executable trades
2. **With Bitfinex (testnet/small account):** Connect → Sync → Ask AI to optimize → Review proposal card → Approve with minimal size
3. **WebSocket:** Assistant header shows `Ready · provider/model`; messages stream with markdown
4. **Health:** `curl http://localhost:3001/api/health`

---

## Questions agents should ask the user

- Before enabling production trading: confirm Bitfinex key permissions and `TRADE_MAX_USD_PER_ORDER`
- Before schema migrations on existing data: confirm backup of `data/portfolio.db`
- Before adding auth: clarify single-user vs multi-tenant requirements

---

## Related docs

- User-facing setup and API: [README.md](./README.md)
- pi SDK patterns: `@earendil-works/pi-coding-agent` docs (external package)
- Bitfinex API: https://docs.bitfinex.com/
- Hyperliquid API: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
