// Module of an activity `type` ("inventory.item.created" -> "inventory"), with
// the label/icon/color the Activity screens use. Shared by the API (module
// filter) and the UI so both agree. `icon` is a lucide-react icon name.

export const ACTIVITY_MODULES = [
  { key: "inventory", label: "Inventario", icon: "Boxes", color: "#0ea5e9" },
  { key: "fleet", label: "Flotilla", icon: "Truck", color: "#f59e0b" },
  { key: "hr", label: "Recursos humanos", icon: "UsersRound", color: "#8b5cf6" },
  { key: "contacts", label: "Contactos", icon: "Contact", color: "#14b8a6" },
  { key: "pos", label: "Punto de venta", icon: "ShoppingCart", color: "#ef4444" },
  { key: "purchase", label: "Compras", icon: "ShoppingBag", color: "#f97316" },
  { key: "catalog", label: "Catálogo", icon: "BookOpen", color: "#22c55e" },
  { key: "ledger", label: "Finanzas", icon: "Wallet", color: "#10b981" },
  { key: "documents", label: "Documentos", icon: "FileText", color: "#64748b" },
  { key: "files", label: "Archivos", icon: "Folder", color: "#64748b" },
  { key: "chat", label: "Chat", icon: "MessageSquare", color: "#6366f1" },
  { key: "growth", label: "Crecimiento", icon: "TrendingUp", color: "#ec4899" },
  { key: "site", label: "Sitio web", icon: "Globe", color: "#06b6d4" },
  { key: "page", label: "Páginas", icon: "LayoutTemplate", color: "#06b6d4" },
  { key: "company", label: "Empresa", icon: "Building2", color: "#6366f1" },
  { key: "identity", label: "Usuarios", icon: "ShieldCheck", color: "#6366f1" },
  { key: "core", label: "Sistema", icon: "Settings", color: "#64748b" },
  { key: "platform", label: "Sistema", icon: "Settings", color: "#64748b" },
  { key: "mcp", label: "Integraciones", icon: "Plug", color: "#a855f7" },
];

const FALLBACK = { key: "other", label: "Otro", icon: "Activity", color: "#94a3b8" };

export function activityModule(type) {
  const prefix = String(type ?? "").toLowerCase().split(".")[0];
  return ACTIVITY_MODULES.find((m) => m.key === prefix) ?? FALLBACK;
}
