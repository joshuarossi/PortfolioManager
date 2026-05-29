import { Hono } from "hono";
import { getMarketPrices } from "../services/market";
import { getLatestPortfolio } from "../services/portfolio";

const app = new Hono();

app.get("/prices", async (c) => {
  const symbolsParam = c.req.query("symbols");
  const symbols = symbolsParam
    ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : undefined;

  if (!symbols?.length) {
    const portfolio = await getLatestPortfolio();
    const fromHoldings = Object.keys(portfolio.byCurrency);
    const merged = [...new Set([...fromHoldings, "BTC", "ETH"])];
    const result = await getMarketPrices(merged);
    return c.json(result);
  }

  const result = await getMarketPrices(symbols);
  return c.json(result);
});

export default app;
