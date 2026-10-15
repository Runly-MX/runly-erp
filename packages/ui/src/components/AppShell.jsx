import { useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Contact,
  ContactRound,
  CreditCard,
  FileText,
  FolderOpen,
  FormInput,
  Globe,
  Images,
  Landmark,
  LayoutDashboard,
  LayoutTemplate,
  Layers,
  MapPin,
  Moon,
  Network,
  Palette,
  Puzzle,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  SquareKanban,
  Sun,
  Tag,
  Truck,
  UserCheck,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import { cn } from "../lib/utils.js";

const icons = {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  Contact,
  ContactRound,
  CreditCard,
  FileText,
  FolderOpen,
  FormInput,
  Globe,
  Images,
  Landmark,
  LayoutDashboard,
  LayoutTemplate,
  Layers,
  MapPin,
  Network,
  Palette,
  Puzzle,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  SquareKanban,
  Tag,
  Truck,
  UserCheck,
  Users,
  UsersRound,
  Wallet,
};

export function AppShell({
  navigation = [],
  currentPath = "/",
  children,
  onThemeToggle,
  isDark,
  headerActions = null,
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]",
      )}
    >
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-dvh z-40 flex flex-col transition-all duration-300",
          collapsed ? "w-16" : "w-64",
          "glass-strong border-r border-[hsl(var(--border))]",
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex items-center gap-3 p-4 border-b border-[hsl(var(--border))]",
            collapsed && "justify-center",
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-(--runly-blue) text-white shadow-sm">
            <span className="text-xs font-bold">A</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--muted-foreground))]">
                Runly
              </p>
              <h1 className="text-sm font-semibold leading-tight">ERP</h1>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {navigation.map((item) => {
            const Icon = icons[item.icon] ?? Puzzle;
            const active = currentPath === item.path;
            return (
              <a
                key={item.path}
                href={item.path}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-150",
                  collapsed && "justify-center px-0",
                  active
                    ? "glass-tinted text-(--runly-cyan) font-medium"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
                )}
              >
                <Icon size={17} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </a>
            );
          })}
        </nav>

        {/* Footer actions */}
        <div
          className={cn(
            "p-2 border-t border-[hsl(var(--border))] flex items-center gap-1",
            collapsed ? "flex-col" : "flex-row justify-between",
          )}
        >
          {onThemeToggle && (
            <button
              onClick={onThemeToggle}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-colors"
              title="Toggle theme"
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={cn(
          "transition-all duration-300 min-h-dvh",
          collapsed ? "ml-16" : "ml-64",
        )}
      >
        {headerActions && (
          <div className="fixed top-3 right-4 z-30 flex items-center gap-2">
            {headerActions}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
