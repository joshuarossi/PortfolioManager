import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Wallet,
  Link2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import clsx from "clsx";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, spotlight: "nav-dashboard" },
  { to: "/portfolio", label: "Portfolio", icon: Wallet, spotlight: "nav-portfolio" },
  { to: "/exchanges", label: "Exchanges", icon: Link2, spotlight: "nav-exchanges" },
  { to: "/assistant", label: "AI Assistant", icon: Sparkles, spotlight: "nav-assistant" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-surface-border bg-surface/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-6 py-6 border-b border-surface-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20">
            <TrendingUp className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-100">Portfolio Manager</h1>
            <p className="text-xs text-gray-500">Multi-exchange tracker</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {nav.map(({ to, label, icon: Icon, spotlight }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-spotlight={spotlight}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-accent/15 text-accent-hover"
                    : "text-gray-400 hover:bg-surface-overlay hover:text-gray-200",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-surface-border px-4 py-4">
          <p className="text-xs text-gray-600">v1.0 · Bitfinex + Hyperliquid</p>
        </div>
      </aside>

      <main className="ml-64 flex-1">
        <div className="mx-auto max-w-7xl px-8 py-8 animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
