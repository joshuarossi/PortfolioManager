import { Hono } from "hono";
import { executeProposal, getProposal } from "../services/trading";

const app = new Hono();

app.get("/proposals/:id", (c) => {
  const clientId = c.req.query("clientId") ?? "default";
  const proposal = getProposal(c.req.param("id"), clientId);
  if (!proposal) return c.json({ error: "Proposal not found or expired" }, 404);
  return c.json(proposal);
});

app.post("/proposals/:id/execute", async (c) => {
  let clientId = c.req.query("clientId") ?? "default";
  try {
    const body = await c.req.json<{ clientId?: string }>();
    if (body.clientId) clientId = body.clientId;
  } catch {
    // empty body ok
  }

  try {
    const { results, portfolio } = await executeProposal(c.req.param("id"), clientId);
    const allOk = results.every((r) => r.success);
    return c.json({ success: allOk, results, portfolio }, allOk ? 200 : 207);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Execution failed" },
      400,
    );
  }
});

export default app;
