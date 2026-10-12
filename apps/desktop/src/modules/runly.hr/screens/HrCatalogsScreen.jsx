import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, ChipTabs, ConfirmDialog, Input, PageHeader, Skeleton, cn } from "@runly/ui";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  Briefcase,
  Building2,
  Check,
  Edit2,
  Plus,
  Power,
  PowerOff,
  X,
} from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { usePersistedTab } from "../../../hooks/usePersistedTab.js";
import { runly } from "../../../lib/runly";

// ── Row skeleton ──────────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--border))] last:border-0">
      <Skeleton className="h-4 w-48 rounded" />
      <Skeleton className="h-5 w-14 rounded-full ml-auto" />
      <Skeleton className="h-7 w-7 rounded-lg" />
      <Skeleton className="h-7 w-7 rounded-lg" />
    </div>
  );
}

// ── Catalog row ───────────────────────────────────────────────────────────────

function CatalogRow({ item, onUpdate, onToggleEnabled, isToggling, canManage }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const inputRef = useRef(null);

  function handleStartEdit() {
    setDraft(item.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleCancelEdit() {
    setEditing(false);
    setDraft(item.name);
  }

  function handleSaveEdit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === item.name) {
      handleCancelEdit();
      return;
    }
    onUpdate(item.id, trimmed, () => setEditing(false));
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleSaveEdit();
    if (e.key === "Escape") handleCancelEdit();
  }

  function handleToggle() {
    if (item.enabled) {
      setConfirmDisable(true);
    } else {
      onToggleEnabled(item.id, true);
    }
  }

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15 }}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--border))] last:border-0 transition-colors",
          !item.enabled && "opacity-50",
        )}
      >
        {editing ? (
          <>
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 h-8 text-sm"
              aria-label="Editar nombre"
            />
            <button
              type="button"
              onClick={handleSaveEdit}
              aria-label="Guardar"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-50 dark:hover:bg-emerald-950"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              aria-label="Cancelar"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--muted))]"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 truncate text-sm text-[hsl(var(--foreground))] font-medium">
              {item.name}
            </span>
            <Badge
              variant={item.enabled ? "success" : "outline"}
              className="text-xs"
            >
              {item.enabled ? "Activo" : "Inactivo"}
            </Badge>

            {/* action buttons — always visible for touch compatibility */}
            {canManage && (
              <div className="flex items-center gap-0.5">
                {/* edit */}
                <button
                  type="button"
                  onClick={handleStartEdit}
                  aria-label="Editar"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                >
                  <Edit2 size={13} />
                </button>

                {/* toggle — PowerOff when active, Power when inactive */}
                <button
                  type="button"
                  onClick={handleToggle}
                  disabled={isToggling}
                  aria-label={item.enabled ? "Deshabilitar" : "Habilitar"}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:cursor-wait",
                    item.enabled
                      ? "text-[hsl(var(--muted-foreground))] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400"
                      : "text-[hsl(var(--muted-foreground))] hover:bg-emerald-100 hover:text-emerald-600 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-400",
                  )}
                >
                  {item.enabled ? <PowerOff size={13} /> : <Power size={13} />}
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>

      <ConfirmDialog
        open={confirmDisable}
        onOpenChange={setConfirmDisable}
        title="Deshabilitar registro"
        description={`¿Deshabilitar "${item.name}"? Los colaboradores que lo tengan asignado no se verán afectados.`}
        confirmLabel="Deshabilitar"
        variant="destructive"
        onConfirm={() => {
          onToggleEnabled(item.id, false);
          setConfirmDisable(false);
        }}
      />
    </>
  );
}

// ── Create row ────────────────────────────────────────────────────────────────

function CreateRow({ onAdd, isCreating }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  function handleAdd() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed, () => {
      setValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
    });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleAdd();
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Nombre del nuevo registro..."
        className="flex-1 h-8 text-sm"
        disabled={isCreating}
        aria-label="Nombre del nuevo registro"
      />
      <Button
        type="button"
        size="sm"
        disabled={!value.trim() || isCreating}
        onClick={handleAdd}
      >
        {isCreating ? (
          "Creando..."
        ) : (
          <>
            <Plus size={14} className="mr-1.5" />
            Agregar
          </>
        )}
      </Button>
    </div>
  );
}

// ── Catalog panel ─────────────────────────────────────────────────────────────

function CatalogPanel({ queryKey, fetcher, creator, updater, toggler, canCreate, canUpdate }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: [queryKey],
    queryFn: () => fetcher(token),
    enabled: Boolean(token),
  });

  const items = listQuery.data?.data ?? listQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: (name) => creator({ name }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success("Registro creado");
    },
    onError: (err) =>
      toast.error(err?.message || "No se pudo crear el registro"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }) => updater(id, { name }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success("Nombre actualizado");
    },
    onError: (err) => toast.error(err?.message || "No se pudo actualizar"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => toggler(id, enabled, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (err) =>
      toast.error(err?.message || "No se pudo cambiar el estado"),
  });

  if (listQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden">
      {canCreate && (
        <CreateRow
          onAdd={(name, onDone) =>
            createMutation.mutate(name, { onSuccess: onDone })
          }
          isCreating={createMutation.isPending}
        />
      )}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Sin registros.
          </p>
          {canCreate && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]/70">
              Agrega el primero usando el campo de arriba.
            </p>
          )}
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <CatalogRow
              key={item.id}
              item={item}
              onUpdate={(id, name, onDone) =>
                updateMutation.mutate({ id, name }, { onSuccess: onDone })
              }
              onToggleEnabled={(id, enabled) =>
                toggleMutation.mutate({ id, enabled })
              }
              isToggling={
                toggleMutation.isPending &&
                toggleMutation.variables?.id === item.id
              }
              canManage={canUpdate}
            />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

const TABS = [
  {
    key: "departments",
    label: "Departamentos",
    description: "Áreas de la empresa a las que se asignan los colaboradores.",
    icon: Building2,
    queryKey: "hr-departments",
    fetcher: (token) => runly.hr.listDepartments(token, { limit: 300 }),
    creator: (data, token) => runly.hr.createDepartment(data, token),
    updater: (id, data, token) => runly.hr.updateDepartment(id, data, token),
    toggler: (id, enabled, token) =>
      runly.hr.setDepartmentEnabled(id, enabled, token),
    createPermission: "hr.department.create",
    updatePermission: "hr.department.update",
    readPermission: "hr.department.read",
  },
  {
    key: "job-titles",
    label: "Puestos",
    description: "Cargos o posiciones que pueden ocupar los colaboradores.",
    icon: Briefcase,
    queryKey: "hr-job-titles",
    fetcher: (token) => runly.hr.listJobTitles(token, { limit: 300 }),
    creator: (data, token) => runly.hr.createJobTitle(data, token),
    updater: (id, data, token) => runly.hr.updateJobTitle(id, data, token),
    toggler: (id, enabled, token) =>
      runly.hr.setJobTitleEnabled(id, enabled, token),
    createPermission: "hr.job_title.create",
    updatePermission: "hr.job_title.update",
    readPermission: "hr.job_title.read",
  },
];
const TAB_KEYS = TABS.map((t) => t.key);

export default function HrCatalogsScreen() {
  const { userProfile } = useAuth();
  const permissions = userProfile?.permissions ?? [];
  const hasPermission = (key) => Boolean(userProfile?.isAdmin || permissions.includes(key));
  const [activeTab, setActiveTab] = usePersistedTab("runly.hr.catalogsTab", TAB_KEYS, "departments");

  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0];
  const canCreate = hasPermission(tab.createPermission);
  const canUpdate = hasPermission(tab.updatePermission);

  return (
    <div className="p-4 md:p-6 space-y-6 min-h-dvh">
      <PageHeader
        eyebrow="Runly HR"
        title="Catalogos"
        description="Gestiona departamentos y puestos disponibles para los colaboradores."
      />

      {/* tabs */}
      <ChipTabs
        ariaLabel="Catálogos"
        tabs={TABS.map((t) => ({ value: t.key, label: t.label, icon: t.icon, description: t.description }))}
        value={activeTab}
        onChange={setActiveTab}
      />

      {/* panel */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          <CatalogPanel
            queryKey={tab.queryKey}
            fetcher={tab.fetcher}
            creator={tab.creator}
            updater={tab.updater}
            toggler={tab.toggler}
            canCreate={canCreate}
            canUpdate={canUpdate}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
