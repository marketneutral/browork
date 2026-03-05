import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  Wrench,
  Server,
  Settings,
  Shield,
  Plug,
  Sparkles,
  Radio,
} from "lucide-react";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { path: "/users", label: "Users", icon: Users },
  { path: "/activity", label: "Activity", icon: TrendingUp },
  { path: "/tools", label: "Tools", icon: Wrench },
  { path: "/mcp", label: "MCP Servers", icon: Plug },
  { path: "/skills", label: "Skills", icon: Sparkles },
  { path: "/sessions", label: "Sessions", icon: Radio },
  { path: "/system", label: "System", icon: Server },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-background-secondary">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <Shield className="h-5 w-5 text-primary" />
        <span className="text-sm font-bold tracking-wide text-primary">ADMIN</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ path, label, icon: Icon, end }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-foreground-secondary hover:bg-surface-glass-hover hover:text-foreground"
              }`
            }
          >
            <Icon className="h-4.5 w-4.5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
