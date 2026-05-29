import { useEffect, useState } from "react";
import { Sparkles, AlertTriangle, TrendingUp, Shield } from "lucide-react";
import { api, type AiInsight } from "../lib/api";
import { usePiAgentContext } from "../context/PiAgentContext";
import { Badge, LoadingSpinner } from "../components/ui";
import { AgentChat } from "../components/AgentChat";
import clsx from "clsx";

const insightIcons: Record<string, React.ReactNode> = {
  concentration: <AlertTriangle className="h-4 w-4" />,
  rebalance: <TrendingUp className="h-4 w-4" />,
  diversification: <Shield className="h-4 w-4" />,
  action: <AlertTriangle className="h-4 w-4" />,
  info: <Sparkles className="h-4 w-4" />,
};

export default function AssistantPage() {
  const { connected, status, agentInfo } = usePiAgentContext();
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getInsights().then(setInsights).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-100">AI Assistant</h2>
        <p className="mt-1 text-sm text-gray-500">
          {connected ? status : "Connecting to pi agent…"}
          {agentInfo?.sessionId ? ` · session ${agentInfo.sessionId.slice(0, 8)}` : ""}
          {" · "}
          Use the floating panel (bottom-right) on any page, or chat here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2 flex h-[min(720px,calc(100vh-8rem))] min-h-[480px] flex-col p-4">
          <AgentChat />
        </div>

        <div className="space-y-4">
          <div className="card border-accent/20 bg-accent/5">
            <h3 className="mb-2 text-sm font-medium text-gray-200">Trading</h3>
            <p className="text-xs text-gray-500">
              Bitfinex only. The AI analyzes your portfolio and proposes orders — nothing executes
              until you click <strong className="text-gray-400">Approve & Execute</strong>.
            </p>
          </div>

          <div className="card">
            <h3 className="mb-3 text-sm font-medium text-gray-300">Live Insights</h3>
            {insights.length === 0 ? (
              <p className="text-sm text-gray-500">Sync your portfolio to generate insights.</p>
            ) : (
              <div className="space-y-3">
                {insights.map((insight, i) => (
                  <div key={i} className="rounded-lg border border-surface-border bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          insight.severity === "high" && "text-loss",
                          insight.severity === "medium" && "text-yellow-400",
                          insight.severity === "low" && "text-accent",
                        )}
                      >
                        {insightIcons[insight.type] ?? <Sparkles className="h-4 w-4" />}
                      </span>
                      <span className="text-sm font-medium text-gray-200">{insight.title}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500">{insight.description}</p>
                    {insight.suggestion && (
                      <p className="mt-2 text-xs text-accent-hover">{insight.suggestion}</p>
                    )}
                    <div className="mt-2">
                      <Badge
                        variant={
                          insight.severity === "high"
                            ? "danger"
                            : insight.severity === "medium"
                              ? "warning"
                              : "default"
                        }
                      >
                        {insight.type}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="mb-2 text-sm font-medium text-gray-300">Agent Tools</h3>
            <ul className="space-y-1 text-xs text-gray-500">
              {(agentInfo?.tools ?? []).map((tool) => (
                <li key={tool}>• {tool}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
