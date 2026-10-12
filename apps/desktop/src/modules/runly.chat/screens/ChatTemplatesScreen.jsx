import { useState } from "react";
import {
  Button, EmptyState, Skeleton, Badge, ConfirmDialog,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  TextField, TextareaField,
} from "@runly/ui";
import { Plus, Pencil, Trash2, Hash, LayoutTemplate } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

// ------------------------------------------------------------------
// Template form dialog (create + edit)
// ------------------------------------------------------------------

function TemplateFormDialog({ open, onClose, initial }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial?.id);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [tagsRaw, setTagsRaw] = useState((initial?.tags ?? []).join(", "));
  const [error, setError] = useState("");

  // Sync fields when dialog opens with a different template
  function resetForm(next) {
    setTitle(next?.title ?? "");
    setBody(next?.body ?? "");
    setTagsRaw((next?.tags ?? []).join(", "));
    setError("");
  }

  const { mutate, isPending } = useMutation({
    mutationFn: (data) =>
      isEdit
        ? runly.chat.updateTemplate(initial.id, data, token)
        : runly.chat.createTemplate(data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-templates"] });
      onClose();
    },
    onError: (err) => setError(err?.message ?? "Error al guardar la plantilla."),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setError("El titulo es obligatorio."); return; }
    if (!body.trim()) { setError("El cuerpo es obligatorio."); return; }
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    mutate({ title: title.trim(), body: body.trim(), tags });
  }

  function handleOpenChange(v) {
    if (!v) { resetForm(null); onClose(); }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <TextField
            label="Titulo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Saludo inicial"
            required
          />
          <div className="space-y-1.5">
            <TextareaField
              label="Cuerpo del mensaje"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribe el texto de la plantilla..."
              rows={5}
              required
            />
            <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">
              Variables disponibles:{" "}
              {["{nombre_agente}", "{nombre_cliente}", "{email_cliente}"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBody((prev) => prev + v)}
                  className="inline font-mono bg-[hsl(var(--muted))] hover:bg-[hsl(var(--border))] px-1 py-0.5 rounded text-[10px] mr-1 cursor-pointer transition-colors"
                >
                  {v}
                </button>
              ))}
            </p>
          </div>
          <TextField
            label="Etiquetas (separadas por coma)"
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="soporte, ventas, facturacion"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { resetForm(null); onClose(); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear plantilla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------
// Template card
// ------------------------------------------------------------------

function TemplateCard({ template, onEdit, onDelete }) {
  return (
    <div className="group relative flex flex-col gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-4 hover:border-[var(--brand-primary)]/40 transition-colors">
      {/* Actions — top right corner */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(template)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-red-400 hover:text-red-300"
          onClick={() => onDelete(template)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold pr-16 leading-snug">{template.title}</p>

      {/* Body preview */}
      <p className="text-xs text-[hsl(var(--muted-foreground))] line-clamp-3 leading-relaxed">
        {template.body}
      </p>

      {/* Footer: tags + usage */}
      <div className="flex items-center gap-2 flex-wrap mt-1">
        {(template.tags ?? []).map((tag) => (
          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
            <Hash className="h-2.5 w-2.5" />
            {tag}
          </Badge>
        ))}
        <span className="ml-auto text-[10px] text-[hsl(var(--muted-foreground))]">
          {template.usage_count ?? 0} {template.usage_count === 1 ? "uso" : "usos"}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Main screen
// ------------------------------------------------------------------

export function ChatTemplatesScreen() {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["chat-templates"],
    queryFn: () => runly.chat.listTemplates(token),
    enabled: Boolean(token),
    staleTime: 30_000,
  });

  const { mutate: deleteTemplate, isPending: isDeleting } = useMutation({
    mutationFn: (id) => runly.chat.deleteTemplate(id, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-templates"] });
      setDeleteTarget(null);
    },
  });

  const templates = data?.data ?? [];

  function handleEdit(template) {
    setEditTarget(template);
    setFormOpen(true);
  }

  function handleNew() {
    setEditTarget(null);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-3 sm:px-6 py-2 sm:py-4 border-b border-[hsl(var(--border))] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">Plantillas de respuesta</h1>
          <p className="hidden sm:block text-xs text-[hsl(var(--muted-foreground))]">Crea y gestiona respuestas rapidas para el chat externo.</p>
        </div>
        <Button onClick={handleNew} size="sm" className="shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1" />
          <span className="hidden xs:inline">Nueva plantilla</span>
          <span className="xs:hidden">Nueva</span>
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-[hsl(var(--border))] p-4 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && templates.length === 0 && (
          <EmptyState
            icon={LayoutTemplate}
            title="Sin plantillas"
            description="Crea plantillas de respuesta para agilizar las conversaciones con visitantes."
            action={{ label: "Crear primera plantilla", onClick: handleNew }}
          />
        )}

        {templates.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <TemplateFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTarget(null); }}
        initial={editTarget}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="Eliminar plantilla"
        description={`Eliminar la plantilla "${deleteTarget?.title}"? Esta accion no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={() => deleteTemplate(deleteTarget.id)}
        loading={isDeleting}
      />
    </div>
  );
}
