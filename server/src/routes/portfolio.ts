import { Hono } from "hono";
import {
  getLatestPortfolio,
  getPortfolioHistory,
  getBalanceHistory,
  syncAllExchanges,
} from "../services/portfolio";

const app = new Hono();

app.get("/", async (c) => {
  const portfolio = await getLatestPortfolio();
  return c.json(portfolio);
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
  const results = await syncAllExchanges();
  const portfolio = await getLatestPortfolio();
  return c.json({ results, portfolio });
});

export default app;
