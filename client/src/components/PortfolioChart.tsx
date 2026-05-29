import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from "recharts";
import { formatUsd, type PnlHistoryPoint } from "../lib/api";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

function computeYDomain(values: number[]): [number, number] {
  if (values.length === 0) return [-1, 1];

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min;

  if (span === 0) {
    const pad = Math.max(Math.abs(max) * 0.25, 1);
    return [min - pad, max + pad];
  }

  const pad = span * 0.15;
  return [min - pad, max + pad];
}

function maxAbsValue(values: number[]): number {
  if (values.length === 0) return 1;
  return Math.max(...values.map((v) => Math.abs(v)), 0.01);
}

function formatAxisUsd(value: number, maxAbs: number): string {
  const v = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(v)) return "$0";

  if (maxAbs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (maxAbs >= 10_000) return `$${(v / 1_000).toFixed(0)}k`;
  if (maxAbs >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  if (maxAbs >= 10) return `$${Math.round(v)}`;
  if (maxAbs >= 1) return `$${v.toFixed(1)}`;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function formatChartDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface PnlChartProps {
  data: PnlHistoryPoint[];
}

export function PnlChart({ data }: PnlChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-500">
        Sync your exchanges to see PnL history
      </div>
    );
  }

  const hasActivity = data.some((d) => d.netDeposits > 0 || d.portfolioValue > 0);
  if (!hasActivity) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-500">
        Connect Bitfinex and sync to track deposits and PnL over time
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatChartDate(d.date),
  }));

  const latest = chartData[chartData.length - 1];
  const stroke = latest.pnl >= 0 ? "#22c55e" : "#ef4444";
  const gradientId = latest.pnl >= 0 ? "pnlProfitGradient" : "pnlLossGradient";
  const pnlValues = chartData.map((d) => d.pnl);
  const yDomain = computeYDomain(pnlValues);
  const axisScale = maxAbsValue(pnlValues);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pnlProfitGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="pnlLossGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#6b7280", fontSize: 12 }}
          minTickGap={32}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#6b7280", fontSize: 12 }}
          domain={yDomain}
          tickCount={5}
          tickFormatter={(value) => formatAxisUsd(value, axisScale)}
          width={64}
        />
        <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 4" />
        <Tooltip
          contentStyle={{
            background: "#161922",
            border: "1px solid #2a3042",
            borderRadius: "8px",
            fontSize: "13px",
          }}
          formatter={(value: number, name: string) => {
            const labels: Record<string, string> = {
              pnl: "PnL",
              portfolioValue: "Portfolio value",
              netDeposits: "Net deposits",
            };
            return [formatUsd(value), labels[name] ?? name];
          }}
          labelFormatter={(label) => String(label)}
        />
        <Area
          type="monotone"
          dataKey="pnl"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface PortfolioChartProps {
  data: { date: string; totalUsdValue: number }[];
}

export function PortfolioChart({ data }: PortfolioChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-500">
        Sync your exchanges to see portfolio history
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatChartDate(d.date),
  }));

  const valueSeries = chartData.map((d) => d.totalUsdValue);
  const yDomain = computeYDomain(valueSeries);
  const axisScale = maxAbsValue(valueSeries);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#6b7280", fontSize: 12 }}
          minTickGap={32}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#6b7280", fontSize: 12 }}
          domain={yDomain}
          tickCount={5}
          tickFormatter={(value) => formatAxisUsd(value, axisScale)}
          width={64}
        />
        <Tooltip
          contentStyle={{
            background: "#161922",
            border: "1px solid #2a3042",
            borderRadius: "8px",
            fontSize: "13px",
          }}
          formatter={(value: number) => [formatUsd(value), "Portfolio Value"]}
        />
        <Area
          type="monotone"
          dataKey="totalUsdValue"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#portfolioGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface AllocationChartProps {
  data: { name: string; value: number }[];
}

export function AllocationChart({ data }: AllocationChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-500">
        No allocation data
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width="50%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#161922",
              border: "1px solid #2a3042",
              borderRadius: "8px",
              fontSize: "13px",
            }}
            formatter={(value: number) => formatUsd(value)}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {data.slice(0, 6).map((item, i) => (
          <div key={item.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="text-gray-300">{item.name}</span>
            </div>
            <span className="font-mono text-gray-400">{formatUsd(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
