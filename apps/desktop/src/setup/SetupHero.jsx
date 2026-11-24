import { Layers, Building2, Shield, Zap } from "lucide-react";
import { useThemeStore } from "../stores/theme";
import { RUNLY_EDITION_NAME } from "../lib/appConfig.js";

const METRICS = [
  { value: "<40 ms", label: "Respuesta", delay: "0s" },
  { value: "99.9%", label: "Disponible", delay: ".6s" },
  { value: "0", label: "Downtime", delay: "1.2s" },
];

const FEATURES = [
  {
    icon: Layers,
    title: "Modular por diseño",
    desc: "Cada módulo que instalas tiene un propósito. Sin dependencias ocultas, sin peso extra.",
  },
  {
    icon: Building2,
    title: "Multi-empresa",
    desc: "Varias organizaciones bajo una sola instancia, con datos completamente separados.",
  },
  {
    icon: Shield,
    title: "Datos en tu servidor",
    desc: "Sin intermediarios. Tus datos viven donde tú decides.",
  },
  {
    icon: Zap,
    title: "Rendimiento real",
    desc: "Diseñado para producción desde el primer día. Rápido donde importa.",
  },
];

// ── SetupHero ──────────────────────────────────────────────────────────────
// Left panel of the setup wizard: wordmark, headline, trust metrics, feature
// list. Sits on top of <AuthAtmosphere> — no background of its own — so it
// reads as one continuous, theme-reactive canvas instead of a hard two-tone
// split. Desktop only; the wizard shell hides this below `lg`.
export function SetupHero() {
  const isDark = useThemeStore((s) => s.isDark);
  const logo = isDark
    ? "/runly/runly-logo-dark-sm.png"
    : "/runly/runly-logo-light-sm.png";

  return (
    <section
      className="hidden lg:flex relative z-10 flex-1 min-w-0 h-dvh overflow-y-auto overflow-x-hidden overscroll-contain flex-col justify-between gap-10 px-13 py-12"
      style={{ scrollbarWidth: "none" }}
    >
      <div className="flex items-center justify-between gap-6">
        <img
          src={logo}
          alt="Runly"
          className="h-7.5 w-auto object-contain"
          draggable={false}
        />
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Business in motion.
        </span>
      </div>

      <div className="flex flex-col gap-7 max-w-xl">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="relative w-8.5 h-6.5 shrink-0 overflow-hidden">
              <div
                className="absolute top-0 left-0 w-6.5 h-0.75 rounded-full skew-x-[-18deg]"
                style={{ background: "linear-gradient(90deg,rgba(253,96,22,0),#FD6016)" }}
              />
              <div
                className="absolute top-2.5 left-1 w-7.5 h-0.75 rounded-full skew-x-[-18deg]"
                style={{ background: "linear-gradient(90deg,rgba(228,38,42,0),#E4262A)" }}
              />
              <div
                className="absolute top-5 left-0.5 w-5.5 h-0.75 rounded-full skew-x-[-18deg]"
                style={{ background: "linear-gradient(90deg,rgba(249,162,27,0),#F9A21B)" }}
              />
            </div>
            <div className="flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3 glass" style={{ borderColor: "rgba(253,96,22,.34)" }}>
              <span className="text-[10.5px] uppercase tracking-[0.24em] text-muted-foreground">
                Edición
              </span>
              <span className="text-[12.5px] font-bold uppercase tracking-[0.2em] text-(--brand-primary)">
                {RUNLY_EDITION_NAME}
              </span>
            </div>
          </div>
          <h1 className="text-[clamp(2.375rem,4.4vw,3.75rem)] font-bold leading-[1.05] tracking-tight text-foreground text-pretty">
            Gestión empresarial
            <br />
            <span
              style={{
                backgroundImage:
                  "linear-gradient(96deg,#F9A21B,#FD6016 55%,#E4262A)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              a toda velocidad.
            </span>
          </h1>
          <p className="text-[17px] leading-relaxed text-muted-foreground max-w-[38ch]">
            Configura tu instancia en minutos, en tu propia infraestructura.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {METRICS.map((m) => (
            <div
              key={m.label}
              className="relative overflow-hidden flex flex-col gap-0.5 rounded-2xl px-3.5 py-3 glass"
            >
              <div
                className="absolute top-0 left-0 h-0.5 w-[38%]"
                style={{
                  background: "linear-gradient(90deg,rgba(253,96,22,0),#FD6016)",
                  animation: "authStreak 3.4s cubic-bezier(.4,0,.2,1) infinite",
                  animationDelay: m.delay,
                }}
              />
              <div className="text-[21px] font-bold tracking-tight text-foreground">
                {m.value}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {m.label}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-4 rounded-2xl px-4.5 py-4 glass transition-transform duration-200 hover:translate-x-1"
            >
              <div
                className="shrink-0 w-8.5 h-8.5 rounded-[11px] grid place-items-center text-(--brand-primary)"
                style={{
                  background:
                    "linear-gradient(140deg,rgba(253,96,22,.24),rgba(249,162,27,.10))",
                  border: "1px solid rgba(253,96,22,.32)",
                }}
              >
                <f.icon size={15} />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {f.title}
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>Runly ERP · {RUNLY_EDITION_NAME}</span>
        <span>v0.1.0</span>
      </div>
    </section>
  );
}
