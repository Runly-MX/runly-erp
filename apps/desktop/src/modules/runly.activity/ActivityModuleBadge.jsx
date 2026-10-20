import {
  Activity, BookOpen, Boxes, Building2, Contact, FileText, Folder, Globe, LayoutTemplate,
  MessageSquare, Plug, Settings, ShieldCheck, ShoppingBag, ShoppingCart, TrendingUp, Truck, UsersRound, Wallet,
} from "lucide-react";
import { activityModule } from "@runly/validators";

const ICONS = {
  Activity, BookOpen, Boxes, Building2, Contact, FileText, Folder, Globe, LayoutTemplate,
  MessageSquare, Plug, Settings, ShieldCheck, ShoppingBag, ShoppingCart, TrendingUp, Truck, UsersRound, Wallet,
};

// Colored icon tile + module name for an activity `type` (or a module key).
export function ActivityModuleBadge({ type, showLabel = true, size = 16 }) {
  const mod = activityModule(type);
  const Icon = ICONS[mod.icon] ?? Activity;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `${mod.color}22`, color: mod.color }}
        aria-hidden="true"
      >
        <Icon size={size} />
      </span>
      {showLabel ? <span className="text-sm">{mod.label}</span> : null}
    </span>
  );
}

// Registry shape RunlyTable expects for `column.component`.
export const activityComponentRegistry = {
  resolve: (name) =>
    name === "ActivityModuleCell"
      ? ({ row }) => <ActivityModuleBadge type={row?.type} />
      : null,
};
