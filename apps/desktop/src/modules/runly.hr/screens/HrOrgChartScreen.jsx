import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, ComboboxField, EmptyState, Skeleton, cn } from "@runly/ui";
import {
  Briefcase,
  Building2,
  Hash,
  Maximize2,
  Minimize2,
  Network,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  active: {
    bg: "bg-emerald-500/20 dark:bg-emerald-400/20",
    ring: "ring-1 ring-emerald-500/40 dark:ring-emerald-400/30",
    text: "text-emerald-900 dark:text-emerald-300",
  },
  vacation: {
    bg: "bg-amber-500/20 dark:bg-amber-400/20",
    ring: "ring-1 ring-amber-500/40 dark:ring-amber-400/30",
    text: "text-amber-900 dark:text-amber-300",
  },
  inactive: {
    bg: "bg-slate-500/15 dark:bg-slate-400/20",
    ring: "ring-1 ring-slate-400/40 dark:ring-slate-400/30",
    text: "text-slate-700 dark:text-slate-300",
  },
  terminated: {
    bg: "bg-red-500/20 dark:bg-red-400/20",
    ring: "ring-1 ring-red-500/40 dark:ring-red-400/30",
    text: "text-red-900 dark:text-red-300",
  },
};

// Connector color — visible on both light and dark backgrounds
const LINE = "bg-[hsl(var(--foreground)/0.18)]";

function getInitials(name) {
  const parts = (name ?? "").trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function buildEmployeeOptions(employees = []) {
  return [
    { value: "__all__", label: "Toda la organización" },
    ...employees.map((row) => ({
      value: row.id,
      label: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(),
    })),
  ];
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function OrgAvatar({ node }) {
  const colors = STATUS_COLORS[node.status] ?? STATUS_COLORS.inactive;
  const initials = getInitials(node.name);

  return (
    <div
      className={cn(
        "h-11 w-11 shrink-0 rounded-xl flex items-center justify-center font-semibold text-sm overflow-hidden",
        colors.bg,
        colors.ring,
        colors.text,
      )}
    >
      {node.profileImageUrl ? (
        <img
          src={node.profileImageUrl}
          alt={node.name}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}

// ── Linked user chip ──────────────────────────────────────────────────────────

function LinkedUserChip({ linkedUser, onClick }) {
  const initials = getInitials(linkedUser.displayName);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`Ver usuario ${linkedUser.displayName}`}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2 py-0.5 w-full",
        "bg-[var(--brand-primary)]/8 dark:bg-[var(--brand-primary)]/15",
        "border border-[var(--brand-primary)]/15 dark:border-[var(--brand-primary)]/20",
        "hover:bg-[var(--brand-primary)]/15 dark:hover:bg-[var(--brand-primary)]/25",
        "transition-colors group/chip",
      )}
    >
      {/* Mini avatar */}
      <div className="h-5 w-5 shrink-0 rounded-full overflow-hidden bg-[var(--brand-primary)]/20 flex items-center justify-center">
        {linkedUser.avatarUrl ? (
          <img
            src={linkedUser.avatarUrl}
            alt={linkedUser.displayName}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[8px] font-semibold text-[var(--brand-primary)]/70">
            {initials}
          </span>
        )}
      </div>
      <span className="text-[10px] font-medium text-[var(--brand-primary)]/80 group-hover/chip:text-[var(--brand-primary)] truncate leading-none transition-colors">
        {linkedUser.displayName}
      </span>
    </button>
  );
}

// ── Node card ─────────────────────────────────────────────────────────────────

function OrgCard({ node, token, onOpen, onOpenUser }) {
  const reportCount = node.children?.length ?? 0;
  const colors = STATUS_COLORS[node.status] ?? STATUS_COLORS.inactive;

  return (
    <div
      className={cn(
        "w-64 rounded-2xl cursor-pointer select-none",
        // Card surface — solid in both themes, glass treatment via shadow + border
        "bg-[hsl(var(--card))]",
        "border border-[hsl(var(--border))]",
        "shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.4)]",
        "transition-all duration-200 hover:scale-[1.025] hover:-translate-y-0.5",
        "hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.55)]",
        "hover:border-[var(--brand-primary)]/40",
        "p-4",
      )}
      onClick={onOpen}
      aria-label={`Ver detalle de ${node.name}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <OrgAvatar node={node} />

        {/* Name + code */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[hsl(var(--foreground))] leading-snug break-words line-clamp-3">
            {node.name}
          </p>
          {node.employeeCode && (
            <div className="flex items-center gap-1 mt-1">
              <Hash
                size={10}
                className="shrink-0 text-[hsl(var(--muted-foreground))]"
              />
              <span className="text-[10px] font-mono text-[hsl(var(--muted-foreground))]/80">
                {node.employeeCode}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Linked user — shown below name when a user account is associated */}
      {node.linkedUser && (
        <div className="mt-2">
          <LinkedUserChip
            linkedUser={node.linkedUser}
            onClick={() => onOpenUser?.(node.linkedUser.id)}
          />
        </div>
      )}

      {/* Job + department */}
      {(node.jobTitle || node.department) && (
        <div className="mt-3 pt-3 border-t border-[hsl(var(--border))]/40 space-y-1.5">
          {node.jobTitle && (
            <div className="flex items-start gap-2">
              <Briefcase
                size={11}
                className="shrink-0 mt-px text-[var(--brand-primary)]/60"
              />
              <span className="text-xs text-[hsl(var(--foreground))]/70 leading-tight break-words">
                {node.jobTitle}
              </span>
            </div>
          )}
          {node.department && (
            <div className="flex items-start gap-2">
              <Building2
                size={11}
                className="shrink-0 mt-px text-[var(--brand-primary)]/60"
              />
              <span className="text-xs text-[hsl(var(--foreground))]/70 leading-tight break-words">
                {node.department}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer: people count pill */}
      {reportCount > 0 && (
        <div className="mt-3 flex">
          <div className="flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)]/8 dark:bg-[var(--brand-primary)]/15 px-2.5 py-1">
            <Network size={10} className="text-[var(--brand-primary)]/70" />
            <span className="text-[10px] font-medium text-[var(--brand-primary)]/80">
              {reportCount} {reportCount !== 1 ? "personas" : "persona"} a cargo
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vertical tree (top → down) ────────────────────────────────────────────────

function OrgNodeV({ node, token, onOpen, onOpenUser }) {
  const children = node.children ?? [];
  const n = children.length;

  return (
    <div className="flex flex-col items-center">
      <OrgCard
        node={node}
        token={token}
        onOpen={() => onOpen(node.id)}
        onOpenUser={onOpenUser}
      />

      {n > 0 && (
        <>
          {/* Stem from parent down */}
          <div className={cn("w-0.5 h-5", LINE)} />

          {n === 1 ? (
            <OrgNodeV
              node={children[0]}
              token={token}
              onOpen={onOpen}
              onOpenUser={onOpenUser}
            />
          ) : (
            /* Multi-child: horizontal bridge using adjacent-child borders trick */
            <div className="flex items-start gap-0">
              {children.map((child, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === n - 1;
                return (
                  <div
                    key={child.id}
                    className="relative flex flex-col items-center px-3"
                  >
                    {/* Horizontal arm — spans to adjacent child so they connect */}
                    <div
                      className={cn(
                        "absolute top-0 h-0.5",
                        LINE,
                        isFirst
                          ? "left-1/2 right-0"
                          : isLast
                            ? "left-0 right-1/2"
                            : "left-0 right-0",
                      )}
                    />
                    {/* Vertical drop from arm to child card */}
                    <div className={cn("mt-px w-0.5 h-4", LINE)} />
                    <OrgNodeV
                      node={child}
                      token={token}
                      onOpen={onOpen}
                      onOpenUser={onOpenUser}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Horizontal tree (left → right) ───────────────────────────────────────────

function OrgNodeH({ node, token, onOpen, onOpenUser }) {
  const children = node.children ?? [];
  const n = children.length;

  return (
    <div className="flex items-center">
      <OrgCard
        node={node}
        token={token}
        onOpen={() => onOpen(node.id)}
        onOpenUser={onOpenUser}
      />

      {n > 0 && (
        <div className="flex items-center">
          {/* Horizontal stem right from parent */}
          <div className={cn("h-0.5 w-5", LINE)} />

          {n === 1 ? (
            <OrgNodeH
              node={children[0]}
              token={token}
              onOpen={onOpen}
              onOpenUser={onOpenUser}
            />
          ) : (
            /* Multi-child: vertical bridge */
            <div className="flex flex-col items-start">
              {children.map((child, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === n - 1;
                return (
                  <div
                    key={child.id}
                    className="relative flex items-center py-3"
                  >
                    {/* Vertical arm — spans to adjacent child */}
                    <div
                      className={cn(
                        "absolute left-0 w-0.5",
                        LINE,
                        isFirst
                          ? "top-1/2 bottom-0"
                          : isLast
                            ? "top-0 bottom-1/2"
                            : "top-0 bottom-0",
                      )}
                    />
                    {/* Short horizontal stub to child */}
                    <div className={cn("ml-px h-0.5 w-4", LINE)} />
                    <OrgNodeH
                      node={child}
                      token={token}
                      onOpen={onOpen}
                      onOpenUser={onOpenUser}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTouchDistance(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HrOrgChartScreen() {
  const { session } = useAuth();
  const token = session?.access_token;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [direction, setDirection] = useState("vertical");

  const canvasRef = useRef(null);

  // Pan tracking (single pointer)
  const ds = useRef({
    active: false,
    hasMoved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  // Pinch tracking (two pointers)
  const activePtrs = useRef(new Map()); // pointerId → {x, y}
  const pinch = useRef({ active: false, startDist: 1, startScale: 1 });

  const rootEmployeeId = params.get("root") || "__all__";

  // Wheel zoom — must be non-passive to allow preventDefault
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function onWheel(e) {
      e.preventDefault();
      const step = e.deltaY > 0 ? -0.12 : 0.12;
      setScale((prev) =>
        Math.min(2.5, Math.max(0.25, Number((prev + step).toFixed(2)))),
      );
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const employeesQuery = useQuery({
    queryKey: ["hr-employees-org-options"],
    queryFn: () => runly.hr.listEmployees(token, { limit: 500, enabled: true }),
    enabled: Boolean(token),
  });

  const orgQuery = useQuery({
    queryKey: ["hr-org-chart", rootEmployeeId],
    queryFn: () =>
      runly.hr.getOrgChart(token, {
        enabled: true,
        rootEmployeeId:
          rootEmployeeId === "__all__" ? undefined : rootEmployeeId,
      }),
    enabled: Boolean(token),
  });

  const employeeOptions = useMemo(
    () => buildEmployeeOptions(employeesQuery.data?.data ?? []),
    [employeesQuery.data?.data],
  );

  const roots = orgQuery.data?.data?.roots ?? [];

  function openDetail(id) {
    if (ds.current.hasMoved) return;
    navigate(`/app/m/runly.hr/hr/employees/${id}`);
  }

  function openUser(userProfileId) {
    navigate(`/app/m/runly.identity/identity/users/${userProfileId}`);
  }

  function updateRoot(value) {
    const next = new URLSearchParams(params);
    if (!value || value === "__all__") next.delete("root");
    else next.set("root", value);
    setParams(next, { replace: true });
  }

  function handlePointerDown(e) {
    // NOTE: do NOT call setPointerCapture here — it redirects all click events
    // to the canvas element, preventing clicks on child card elements.
    // onPointerLeave handles the case where the pointer exits the canvas.
    activePtrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePtrs.current.size === 1) {
      // Start pan
      ds.current.active = true;
      ds.current.hasMoved = false;
      ds.current.startX = e.clientX - offset.x;
      ds.current.startY = e.clientY - offset.y;
      ds.current.originX = e.clientX;
      ds.current.originY = e.clientY;
    } else if (activePtrs.current.size === 2) {
      // Second finger → switch to pinch, cancel pan
      ds.current.active = false;
      ds.current.hasMoved = true; // prevents card tap on release
      const pts = [...activePtrs.current.values()];
      pinch.current = {
        active: true,
        startDist: getTouchDistance(pts[0], pts[1]),
        startScale: scale,
      };
    }
  }

  function handlePointerMove(e) {
    activePtrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePtrs.current.size >= 2 && pinch.current.active) {
      // Pinch zoom
      const pts = [...activePtrs.current.values()];
      const dist = getTouchDistance(pts[0], pts[1]);
      const ratio = dist / pinch.current.startDist;
      setScale(
        Number(
          Math.min(
            2.5,
            Math.max(0.25, pinch.current.startScale * ratio),
          ).toFixed(2),
        ),
      );
      return;
    }

    if (!ds.current.active) return;
    const dx = e.clientX - ds.current.originX;
    const dy = e.clientY - ds.current.originY;
    if (Math.sqrt(dx * dx + dy * dy) > 4) ds.current.hasMoved = true;
    setOffset({
      x: e.clientX - ds.current.startX,
      y: e.clientY - ds.current.startY,
    });
  }

  function handlePointerUp(e) {
    activePtrs.current.delete(e.pointerId);
    if (activePtrs.current.size === 0) {
      ds.current.active = false;
      pinch.current.active = false;
    } else if (activePtrs.current.size < 2) {
      pinch.current.active = false;
      ds.current.active = false; // user re-presses to pan after pinch
    }
  }

  function resetView() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  // Full-viewport layout: toolbar shrinks, canvas fills the rest — no page scroll
  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-end gap-3 px-4 md:px-6 pt-4 md:pt-5 pb-3">
        <div className="min-w-60 max-w-xs flex-1">
          <ComboboxField
            label="Árbol desde"
            value={rootEmployeeId}
            options={employeeOptions}
            onChange={updateRoot}
            placeholder="Seleccionar raíz..."
            searchPlaceholder="Buscar colaborador..."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Direction toggle */}
          <div className="flex rounded-lg border border-[hsl(var(--border))] overflow-hidden text-sm">
            {[
              { key: "vertical", label: "Vertical" },
              { key: "horizontal", label: "Horizontal" },
            ].map(({ key, label }, i) => (
              <button
                key={key}
                type="button"
                onClick={() => setDirection(key)}
                className={cn(
                  "px-3 h-9 transition-colors",
                  i > 0 && "border-l border-[hsl(var(--border))]",
                  direction === key
                    ? "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] font-medium"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Zoom controls */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setScale((p) => Math.max(0.25, Number((p - 0.15).toFixed(2))))
            }
            aria-label="Alejar"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setScale((p) => Math.min(2.5, Number((p + 0.15).toFixed(2))))
            }
            aria-label="Acercar"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetView}
            aria-label="Restablecer vista"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="flex-1 min-h-0 mx-4 md:mx-6 mb-4 md:mb-5 rounded-2xl border border-[hsl(var(--border))] overflow-hidden flex flex-col"
        style={{
          background: "hsl(var(--background))",
          backgroundImage:
            "radial-gradient(circle, hsl(var(--foreground)/0.07) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {orgQuery.isLoading ? (
          <div className="flex-1 flex flex-col justify-center space-y-4 p-6">
            <div className="flex justify-center gap-6">
              <Skeleton className="h-28 w-52 rounded-2xl" />
            </div>
            <div className="flex justify-center gap-6">
              <Skeleton className="h-28 w-52 rounded-2xl" />
              <Skeleton className="h-28 w-52 rounded-2xl" />
              <Skeleton className="h-28 w-52 rounded-2xl" />
            </div>
          </div>
        ) : roots.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={UsersRound}
              title="Sin estructura jerárquica"
              description="Asigna supervisores a los colaboradores para visualizar el organigrama."
            />
          </div>
        ) : (
          <div
            ref={canvasRef}
            className="flex-1 min-h-0 overflow-hidden select-none cursor-grab active:cursor-grabbing"
            style={{ touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div
              className="min-h-full min-w-full p-10"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin:
                  direction === "vertical" ? "center top" : "left center",
              }}
            >
              {direction === "vertical" ? (
                <div className="flex flex-wrap items-start justify-center gap-10">
                  {roots.map((root) => (
                    <OrgNodeV
                      key={root.id}
                      node={root}
                      token={token}
                      onOpen={openDetail}
                      onOpenUser={openUser}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-start gap-10">
                  {roots.map((root) => (
                    <OrgNodeH
                      key={root.id}
                      node={root}
                      token={token}
                      onOpen={openDetail}
                      onOpenUser={openUser}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
