import { Hono } from "hono";
import { cors } from "hono/cors";
import { runMigrations } from "./db";
import exchangeRoutes from "./routes/exchanges";
import portfolioRoutes from "./routes/portfolio";
import aiRoutes from "./routes/ai";
import tradeRoutes from "./routes/trades";
import marketRoutes from "./routes/market";
import { startSyncScheduler } from "./services/sync-scheduler";
import { registerMarketClient, startMarketStream, watchSymbols } from "./services/market-stream";
import { startBitfinexAccountStreams } from "./services/bitfinex-account-stream";
import { getLatestPortfolio } from "./services/portfolio";
import {
  createAgentConnection,
  disposeAgentConnection,
  getClientId,
  handleClientMessage,
  type AgentConnection,
} from "./agent/ws-handler";

runMigrations();

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.get("/api/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.route("/api/exchanges", exchangeRoutes);
app.route("/api/portfolio", portfolioRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/trades", tradeRoutes);
app.route("/api/market", marketRoutes);

const port = Number(process.env.PORT ?? 3001);

startSyncScheduler();
void startMarketStream().then(async () => {
  const portfolio = await getLatestPortfolio();
  watchSymbols(Object.keys(portfolio.byCurrency));
  await startBitfinexAccountStreams();
});

type WsData =
  | { kind: "agent"; clientId: string; connection?: AgentConnection }
  | { kind: "market"; unregister?: () => void };

console.log(`Portfolio Manager API running on http://localhost:${port}`);

export default {
  port,
  fetch(req: Request, server: Bun.Server<WsData>) {
    const url = new URL(req.url);
    if (url.pathname === "/api/agent") {
      const clientId = getClientId(req.url);
      const upgraded = server.upgrade(req, { data: { kind: "agent", clientId } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    if (url.pathname === "/api/market/ws") {
      const upgraded = server.upgrade(req, { data: { kind: "market" } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    return app.fetch(req);
  },
  websocket: {
    async open(ws: Bun.ServerWebSocket<WsData>) {
      if (ws.data.kind === "market") {
        ws.data.unregister = registerMarketClient({
          send: (data) => ws.send(data),
        });
        return;
      }

      try {
        const connection = await createAgentConnection(
          {
            send: (data) => ws.send(data),
            close: () => ws.close(),
          },
          ws.data.clientId,
        );
        ws.data.connection = connection;
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        ws.close();
      }
    },
    async message(ws: Bun.ServerWebSocket<WsData>, message: string | Buffer) {
      if (ws.data.kind === "market") return;

      const connection = ws.data.connection;
      if (!connection) return;
      try {
        const raw = typeof message === "string" ? message : message.toString();
        await handleClientMessage(connection, raw);
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
    close(ws: Bun.ServerWebSocket<WsData>) {
      if (ws.data.kind === "market") {
        ws.data.unregister?.();
        return;
      }
      if (ws.data.connection) {
        disposeAgentConnection(ws.data.connection);
        ws.data.connection = undefined;
      }
    },
  },
};
