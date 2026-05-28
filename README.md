# Portfolio Manager

A self-hosted portfolio management web app for tracking crypto holdings across multiple exchanges, monitoring value over time, and getting AI-assisted rebalancing—with optional **human-approved** trade execution on Bitfinex.

Built as a **Bun monorepo**: Vite + React SPA on the frontend, Hono API + SQLite on the backend, and a **pi coding-agent** WebSocket assistant for portfolio analysis and trade proposals.

---

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Using the app](#using-the-app)
- [Connecting exchanges](#connecting-exchanges)
- [AI assistant & trading](#ai-assistant--trading)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Development](#development)
- [Security](#security)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

| Area | What you get |
|------|----------------|
| **Multi-exchange** | Bitfinex (API keys) and Hyperliquid (MetaMask wallet verification) |
| **Balance tracking** | Wallet-level snapshots, USD valuation, 15-minute background sync |
| **Portfolio history** | 30-day charts, allocation breakdown, per-currency filters |
| **Rule-based insights** | Concentration, stablecoin drift, margin/perp exposure flags |
| **AI assistant** | pi WebSocket agent with streaming markdown responses |
| **AI trading (Bitfinex)** | Analyze → propose trades → **you approve** → execute market/limit orders |
| **Security** | AES-256-GCM encrypted API keys; Hyperliquid stores address only |

---

## Quick start

### Prerequisites

- [Bun](https://bun.sh) 1.1+
- Node.js is **not** required (Bun handles install/build/runtime)
- For Hyperliquid: [MetaMask](https://metamask.io) browser extension
- For AI assistant: an API key for Anthropic, OpenAI, or a provider configured in pi (`~/.pi/agent/auth.json`)

### Install & run

```bash
# Clone and enter the project
cd PortfolioManager

# Install all workspace dependencies
bun install

# Environment (edit ENCRYPTION_KEY before connecting real keys)
cp .env.example .env

# Database: generate migrations (if schema changed) and apply
bun run db:generate   # only needed after schema edits
bun run db:migrate

# Start API (:3001) + SPA (:5173)
bun run dev
```

Open **[http://localhost:5173](http://localhost:5173)**.

The Vite dev server proxies `/api` (including WebSocket `/api/agent`) to the Bun backend.

### Production build

```bash
bun run build          # client → dist/, server → server/dist/
bun run start          # runs server/dist/index.js
```

Serve the client `client/dist` static files behind a reverse proxy, or extend the server to serve them (not included by default).

---

## Configuration

Environment variables are read from the **repo root** `.env` when running via `bun run dev`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | HTTP + WebSocket server port |
| `DATABASE_URL` | No | `./data/portfolio.db` | SQLite file path |
| `ENCRYPTION_KEY` | **Yes** (production) | — | 32-byte secret for AES-256-GCM API key encryption |
| `ANTHROPIC_API_KEY` | For AI | — | pi assistant provider |
| `OPENAI_API_KEY` | For AI | — | pi assistant provider |
| `GOOGLE_API_KEY` | For AI | — | pi assistant provider |
| `PI_MODEL` | No | auto | Force model, e.g. `anthropic/claude-sonnet-4-20250514` |
| `TRADE_MAX_USD_PER_ORDER` | No | `25000` | Max notional USD per proposed/executed order |

**AI model resolution:** The pi agent picks the first available model from `AuthStorage` / `ModelRegistry`. Set `PI_MODEL` to override. Keys can also live in `~/.pi/agent/auth.json` (pi default).

---

## Using the app

### Dashboard (`/`)

- Total portfolio value, 30-day change, asset/exchange counts
- Portfolio value chart and allocation pie chart
- AI insight cards and top holdings table
- **Sync All** — refreshes every connected exchange

### Portfolio (`/portfolio`)

- Per-currency allocation cards with filter
- Full holdings table (exchange, wallet type, balance, USD value)
- Empty state guides you to connect + sync exchanges

### Exchanges (`/exchanges`)

- Add **Hyperliquid** (MetaMask) or **Bitfinex** (API key + secret)
- Per-exchange sync and delete
- Bitfinex keys are verified on connect

### AI Assistant (`/assistant`)

- Real-time chat via WebSocket (`/api/agent`)
- Streaming markdown responses
- Live rule-based insights sidebar
- **Trade proposals** appear as approval cards when the AI calls `propose_portfolio_trades`

Example prompts:

- *"Give me a portfolio summary"*
- *"Analyze and optimize my portfolio"*
- *"Propose trades to rebalance toward 40% BTC, 30% ETH, 30% stables"*

---

## Connecting exchanges

### Bitfinex (balances + trading)

1. Create API keys at [Bitfinex API Settings](https://setting.bitfinex.com/api)
2. Permissions needed:
   - **Account Info** — read balances
   - **Orders** — required for AI-proposed trade execution
3. Recommended: enable **IP restriction** on the key
4. In the app: **Exchanges → Add Exchange → Bitfinex**
5. Enter label, API key, secret → **Connect & Verify**
6. Click **Sync** (or **Sync All** on Dashboard)

> **Trading uses real funds.** The AI never auto-trades; you must click **Approve & Execute** and confirm the browser dialog.

### Hyperliquid (read-only tracking)

1. **Exchanges → Add Exchange → Hyperliquid**
2. **Connect MetaMask** — select your **main** Hyperliquid deposit address
3. **Sign & Connect** — proves wallet ownership (no private keys stored)
4. **Sync** to pull spot balances and perp positions

Use your **master wallet address**, not a Hyperliquid API agent wallet (agent addresses return empty balances).

Hyperliquid trading is **not implemented yet** — balances come from the public `/info` API only.

---

## AI assistant & trading

### How the agent works

```
Browser                    Server (Bun)
   │                            │
   │──── WebSocket /api/agent ──│
   │     (clientId in query)    │
   │                            ├── pi createAgentSession
   │                            ├── SessionManager (persisted)
   │                            └── portfolio custom tools
   │◄─── stream events ─────────│
   │◄─── trade_proposal ────────│  (when AI proposes trades)
   │                            │
   │──── POST /api/trades/... ──│  (after you approve)
```

**Agent tools:**

| Tool | Purpose |
|------|---------|
| `get_portfolio_summary` | Current holdings, USD values, allocations |
| `get_portfolio_insights` | Rule-based risk/allocation flags |
| `get_connected_exchanges` | Connected accounts (`tradable: true` for Bitfinex) |
| `get_current_app_context` | Browser route/page context |
| `propose_portfolio_trades` | Create trade plan → sends approval UI |

### Trade approval flow

1. AI analyzes portfolio and calls `propose_portfolio_trades` with specific orders
2. A **Trade proposal** card appears in the Assistant chat
3. You review each buy/sell (symbol, amount, market/limit)
4. **Approve & Execute** → `POST /api/trades/proposals/:id/execute`
5. Server validates proposal (TTL, balances, max USD), submits to Bitfinex, syncs portfolio
6. Results shown in the card; AI receives a follow-up message with outcomes

Proposals expire after **10 minutes**. Max **8 trades** per proposal.

---

## Architecture

```
PortfolioManager/
├── package.json              # Bun workspaces root
├── .env                      # Server config (not committed)
├── data/                     # SQLite DB (gitignored)
├── .portfolio-manager/       # pi agent session files (gitignored)
│
├── server/
│   ├── src/
│   │   ├── index.ts          # Hono app + Bun WebSocket upgrade
│   │   ├── agent/
│   │   │   ├── ws-handler.ts       # pi session lifecycle
│   │   │   └── portfolio-tools.ts  # Custom agent tools + system prompt
│   │   ├── db/
│   │   │   ├── schema.ts     # Drizzle SQLite schema
│   │   │   ├── index.ts      # DB connection + migrations
│   │   │   └── migrate.ts
│   │   ├── routes/           # REST endpoints
│   │   └── services/         # Exchange clients, portfolio, trading, crypto
│   └── drizzle/              # SQL migrations
│
└── client/
    ├── src/
    │   ├── pages/            # Dashboard, Portfolio, Exchanges, Assistant
    │   ├── components/       # Charts, TradeProposalCard, MarkdownMessage
    │   ├── hooks/
    │   │   └── usePiAgent.ts # WebSocket client for pi agent
    │   └── lib/
    │       ├── api.ts        # REST client
    │       └── wallet.ts     # MetaMask helpers
    └── vite.config.ts        # Proxies /api + WS to :3001
```

### Data model (SQLite)

| Table | Purpose |
|-------|---------|
| `exchanges` | Connected accounts (Bitfinex keys encrypted, HL wallet address) |
| `balance_snapshots` | Per-wallet balance history |
| `portfolio_snapshots` | Aggregate USD value + JSON breakdown over time |
| `ai_conversations` / `ai_messages` | Legacy REST chat schema (unused by WebSocket agent) |

### Exchange adapters

| Exchange | Auth | Read | Trade |
|----------|------|------|-------|
| Bitfinex | Encrypted API key + secret | Wallets, tickers | Market/limit via `/v2/auth/w/submit` |
| Hyperliquid | MetaMask signature | `/info` spot + perp state | Not yet |

---

## API reference

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | `{ status, timestamp }` |

### Portfolio

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/portfolio` | Current summary (latest snapshots) |
| GET | `/api/portfolio/history?days=30` | Portfolio USD value over time |
| GET | `/api/portfolio/balances/history` | Per-balance history (`exchangeId`, `currency`, `days`) |
| POST | `/api/portfolio/sync` | Sync all active exchanges |

### Exchanges

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/exchanges` | List connections (masked secrets) |
| POST | `/api/exchanges` | Add Bitfinex or Hyperliquid |
| GET | `/api/exchanges/wallet/challenge?address=0x…` | EIP-191 sign message for HL |
| POST | `/api/exchanges/:id/sync` | Sync one exchange |
| PATCH | `/api/exchanges/:id` | Update label / active flag |
| DELETE | `/api/exchanges/:id` | Remove (cascades snapshots) |

### AI

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai/insights` | Rule-based portfolio insights |
| GET | `/api/ai/status` | pi model availability + WebSocket path |

### Trades

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/trades/proposals/:id?clientId=` | Fetch pending proposal |
| POST | `/api/trades/proposals/:id/execute` | Execute approved proposal `{ clientId }` |

### WebSocket agent

| Path | Description |
|------|-------------|
| `WS /api/agent?clientId=<id>` | pi agent session |

**Client → server messages:**

```json
{ "type": "context", "context": { "page": "assistant", "route": "/assistant" } }
{ "type": "prompt", "text": "Analyze my portfolio", "context": { ... } }
{ "type": "abort" }
```

**Server → client messages:**

```json
{ "type": "ready", "sessionId": "...", "model": "anthropic/...", "tools": [...] }
{ "type": "history", "messages": [...] }
{ "type": "event", "event": { "type": "message_update", ... } }
{ "type": "trade_proposal", "proposal": { "proposalId", "summary", "trades", "expiresAt" } }
{ "type": "error", "message": "..." }
```

---

## Development

```bash
# Run server only
bun run --filter server dev

# Run client only
bun run --filter client dev

# After editing server/src/db/schema.ts
bun run db:generate
bun run db:migrate

# Typecheck + build client
cd client && bun run build
```

See **[AGENTS.md](./AGENTS.md)** for contributor/agent guidance: conventions, extension points, and how to add exchanges or features safely.

---

## Security

- **API keys** encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`). Changing the key invalidates stored secrets.
- **Hyperliquid** stores only the verified wallet address — no signing keys for trading.
- **AI trading** requires explicit user approval; proposals are bound to `clientId` and expire.
- **Order limits** enforced via `TRADE_MAX_USD_PER_ORDER` and balance checks on sells.
- **Never commit** `.env`, `*.db`, or `.portfolio-manager/`.
- Run locally or on a trusted network; there is no end-user authentication yet.

---

## Roadmap

- [ ] Hyperliquid trading (API agent wallet + signed `/exchange` actions)
- [ ] Additional CEX integrations (Binance, Coinbase, Kraken)
- [ ] User authentication / multi-tenant support
- [ ] Trade history audit log in SQLite
- [ ] Target allocation profiles with drift alerts
- [ ] Serve client static assets from production server

---

## License

MIT
