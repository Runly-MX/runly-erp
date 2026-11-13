import { useEffect, useState } from "react";
import { Button, cn, getKindAccent } from "@runly/ui";
import { ArrowUpRight, FileSpreadsheet, FileText, FolderOpen, Presentation } from "lucide-react";

export const NEW_DOCUMENT_TYPES = [
  { format: "docx", label: "Documento", short: "Documento", hint: "Ideas, informes y propuestas", kind: "doc", Icon: FileText },
  { format: "xlsx", label: "Hoja de cálculo", short: "Hoja", hint: "Datos, cuentas y presupuestos", kind: "sheet", Icon: FileSpreadsheet },
  { format: "pptx", label: "Presentación", short: "Presentación", hint: "Presenta tu próxima idea", kind: "presentation", Icon: Presentation },
];

// True once the observed block has scrolled out above its scroll container.
export function useScrolledAbove(ref) {
  const [above, setAbove] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setAbove(!entry.isIntersecting && entry.boundingClientRect.top < 0), {
      // The app's top bar covers the first 56px of the viewport.
      rootMargin: "-56px 0px 0px 0px",
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return above;
}

// "Create here" block of the Files header. At the top: three roomy cards. When they
// scroll out of view, a slim bar with the same actions slides in and stays at the top.
// Both say WHERE the document will be created (the open folder).
export function FilesCreateHero({ heroRef, destination, onCreate, canCreate, officeAvailable }) {
  const disabled = !canCreate || !officeAvailable;
  const why = officeAvailable ? undefined : "Disponible cuando Office esté conectado";
  return (
    <>
      <section ref={heroRef} aria-label="Crear en esta ubicación" className="min-w-0">
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
          {NEW_DOCUMENT_TYPES.map(({ format, label, hint, kind, Icon }) => {
            const accent = getKindAccent(kind);
            return (
              <button
                key={format}
                type="button"
                disabled={disabled}
                title={why}
                onClick={() => onCreate(format)}
                className="group relative flex min-w-[15rem] shrink-0 snap-start items-center gap-4 overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/40 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:min-w-0"
                style={{
                  borderColor: `color-mix(in srgb, ${accent} 28%, hsl(var(--border)))`,
                  backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${accent} 16%, hsl(var(--card))), hsl(var(--card)) 70%)`,
                }}
              >
                <Icon aria-hidden="true" className="absolute -bottom-4 -right-3 h-24 w-24 -rotate-12 opacity-[0.07] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" style={{ color: accent }} />
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: accent }}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="relative min-w-0 flex-1">
                  <strong className="block text-base font-semibold">{label}</strong>
                  <span className="block truncate text-sm text-[hsl(var(--muted-foreground))]">{hint}</span>
                </span>
                <ArrowUpRight className="relative h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="shrink-0">Se crean en</span>
          <span className="truncate font-medium text-[hsl(var(--foreground))]" title={destination}>
            {destination}
          </span>
        </p>
      </section>
    </>
  );
}

// Slim bar with the same actions; render it as a direct child of the tall page
// container (not inside the header) so it can stay stuck while the page scrolls.
export function FilesCreateBar({ stuck, destination, onCreate, canCreate, officeAvailable }) {
  const disabled = !canCreate || !officeAvailable;
  const why = officeAvailable ? undefined : "Disponible cuando Office esté conectado";
  return (
    <>
      {/* Zero-height sticky anchor: the bar hangs from it without taking page space. */}
      <div className="sticky top-0 z-20 h-0" style={{ marginTop: 0 }}>
        <div
          aria-hidden={!stuck}
          inert={!stuck}
          className={cn(
            "absolute inset-x-0 top-0 -mx-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 px-4 py-2 shadow-sm backdrop-blur-md transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none md:-mx-6 md:px-6",
            stuck ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0",
          )}
        >
          <div className="flex items-center gap-3">
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <FolderOpen className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
              <span className="hidden shrink-0 text-[hsl(var(--muted-foreground))] sm:inline">Crear en</span>
              <span className="truncate font-medium" title={destination}>
                {destination}
              </span>
            </p>
            <div className="flex shrink-0 gap-1.5">
              {NEW_DOCUMENT_TYPES.map(({ format, label, short, kind, Icon }) => (
                <Button
                  key={format}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 px-2.5"
                  disabled={disabled}
                  title={why ?? label}
                  aria-label={label}
                  onClick={() => onCreate(format)}
                >
                  <Icon className="h-4 w-4" style={{ color: getKindAccent(kind) }} />
                  <span className="hidden md:inline">{short}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
