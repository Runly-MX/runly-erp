import { Sun, Moon } from "lucide-react";
import { useThemeStore } from "../stores/theme";

const BASE = "h-9 w-9 flex shrink-0 items-center justify-center rounded-md cursor-pointer transition-colors duration-150";
const TONE = {
  default: "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
  // Over a dark image (course hero).
  onImage: "text-white/85 hover:text-white hover:bg-white/15",
};

export function ThemeToggle({ tone = "default", className = "" }) {
  const { isDark, toggle } = useThemeStore();
  const label = isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro";

  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} className={`${BASE} ${TONE[tone] ?? TONE.default} ${className}`}>
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
