import clsx from "clsx";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  /** Stable id for agent spotlight (data-ui-spotlight) */
  spotlightId?: string;
}

export function StatCard({ label, value, sub, trend, icon, spotlightId }: StatCardProps) {
  const uiLabel = [label, sub].filter(Boolean).join(" · ");

  return (
    <div
      className="card animate-slide-up"
      {...(spotlightId
        ? {
            "data-ui-spotlight": spotlightId,
            "data-ui-label": uiLabel,
          }
        : {})}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-100">{value}</p>
          {sub && (
            <p
              className={clsx(
                "mt-1 text-sm",
                trend === "up" && "text-profit",
                trend === "down" && "text-loss",
                (!trend || trend === "neutral") && "text-gray-500",
              )}
            >
              {sub}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
}

export function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variant === "default" && "bg-surface-overlay text-gray-300",
        variant === "success" && "bg-profit/15 text-profit",
        variant === "warning" && "bg-yellow-500/15 text-yellow-400",
        variant === "danger" && "bg-loss/15 text-loss",
      )}
    >
      {children}
    </span>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-border border-t-accent" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center py-16 text-center">
      <h3 className="text-lg font-medium text-gray-200">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-gray-500">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
