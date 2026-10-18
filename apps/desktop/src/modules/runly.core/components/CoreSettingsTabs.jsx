import { NavLink } from "react-router-dom";
import { BellRing, Mail, Settings } from "lucide-react";

const TABS = [
  { to: "/app/m/runly.core/settings", end: true, icon: Settings, label: "General" },
  { to: "/app/m/runly.core/settings/smtp", icon: Mail, label: "Correo de esta empresa" },
  { to: "/app/m/runly.core/settings/webpush", icon: BellRing, label: "Web Push" },
];

// Shared tab strip for the runly.core settings screens.
export function CoreSettingsTabs() {
  const base = "px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap";
  const active = `${base} bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]`;
  const inactive = `${base} text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]/50`;
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[hsl(var(--border))] pb-3">
      {TABS.map(({ to, end, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? active : inactive)}>
          <Icon className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          {label}
        </NavLink>
      ))}
    </div>
  );
}
