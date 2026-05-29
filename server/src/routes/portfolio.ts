import { Hono } from "hono";
import {
  getLatestPortfolio,
  getPortfolioHistory,
  getBalanceHistory,
} from "../services/portfolio";
import { getPortfolioPnl, getPnlHistory, getPortfolioPnlDashboard } from "../services/pnl";
import { triggerSync } from "../services/sync-scheduler";

const app = new Hono();

app.get("/", async (c) => {
  const portfolio = await getLatestPortfolio();
  return c.json(portfolio);
});

app.get("/pnl", async (c) => {
  const pnl = await getPortfolioPnl();
  return c.json(pnl);
});

app.get("/pnl/dashboard", async (c) => {
  const days = Number(c.req.query("days") ?? 30);
  const dashboard = await getPortfolioPnlDashboard(days);
  return c.json(dashboard);
});

app.get("/pnl/history", async (c) => {
  const days = Number(c.req.query("days") ?? 30);
  const history = await getPnlHistory(days);
  return c.json(history);
});

app.get("/history", async (c) => {
  const days = Number(c.req.query("days") ?? 30);
  const history = await getPortfolioHistory(days);
  return c.json(history);
});

app.get("/balances/history", async (c) => {
  const exchangeId = c.req.query("exchangeId");
  const currency = c.req.query("currency");
  const days = Number(c.req.query("days") ?? 30);
  const history = await getBalanceHistory(exchangeId, currency, days);
  return c.json(history);
});

app.post("/sync", async (c) => {
  try {
    const data = await triggerSync("API sync");
    return c.json(data);
  } catch (err) {
    console.error("[portfolio] sync failed:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      500,
    );
  }
});

export default app;
