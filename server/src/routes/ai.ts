import { Hono } from "hono";
import { getInsights } from "../services/ai";
import { getPiAssistantStatus } from "../services/pi-assistant";

const app = new Hono();

app.get("/insights", async (c) => {
  const insights = await getInsights();
  return c.json(insights);
});

app.get("/status", async (c) => {
  const status = await getPiAssistantStatus();
  return c.json({ ...status, transport: "websocket", path: "/api/agent" });
});

export default app;
