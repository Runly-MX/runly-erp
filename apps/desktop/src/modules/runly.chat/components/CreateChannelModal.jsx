import { useState, useMemo, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Input, Textarea, Switch, Label, ComboboxField,
} from "@runly/ui";
import { Hash } from "lucide-react";
import { useCreateChannel } from "../hooks/useChannels";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { useQuery, useQueryClient } from "@tanstack/react-query";

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export function CreateChannelModal({ open, onClose, onCreated, defaultLinkedProjectId = null }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [linkedProjectId, setLinkedProjectId] = useState(defaultLinkedProjectId);
  const queryClient = useQueryClient();
  // The caller's default (e.g. the project the modal was opened from) can
  // change while the modal stays mounted — re-apply it on every open.
  useEffect(() => {
    if (open) setLinkedProjectId(defaultLinkedProjectId);
  }, [open, defaultLinkedProjectId]);
  const [error, setError] = useState(null);
  const { mutateAsync: createChannel, isPending } = useCreateChannel();
  const { session } = useAuth();
  const token = session?.access_token;
  const projectsQuery = useQuery({
    queryKey: ["chat-create-channel-projects", token],
    queryFn: async () => {
      // GET /projects returns a raw array (c.json(projects)), not { data: [...] }
      // — verified against apps/api/src/routes/projects/projects-routes.js.
      const res = await runly.projects.listProjects(token);
      return (res?.data ?? res ?? []).map((p) => ({ label: p.name, value: p.id }));
    },
    enabled: Boolean(open && token),
    staleTime: 30_000,
  });

  const effectiveSlug = useMemo(
    () => (slugEdited ? slug : slugify(title)),
    [slug, slugEdited, title],
  );

  function handleTitleChange(e) {
    setTitle(e.target.value);
  }

  function handleSlugChange(e) {
    setSlugEdited(true);
    setSlug(slugify(e.target.value));
  }

  function reset() {
    setTitle("");
    setDescription("");
    setIsPublic(true);
    setSlug("");
    setSlugEdited(false);
    setLinkedProjectId(defaultLinkedProjectId);
    setError(null);
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setError(null);
    try {
      const result = await createChannel({
        title: title.trim(),
        description: description.trim() || undefined,
        isPublic,
        slug: effectiveSlug || undefined,
        linkedModule: linkedProjectId ? "runly.projects" : undefined,
        linkedEntityId: linkedProjectId ?? undefined,
      });
      if (linkedProjectId) queryClient.invalidateQueries({ queryKey: ["project-linked-channel", linkedProjectId] });
      onCreated?.(result?.data ?? result);
      onClose?.();
      reset();
    } catch (err) {
      setError(err?.message ?? "Error creando canal.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose?.(); reset(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-[hsl(var(--primary))]" />
            Crear canal
          </DialogTitle>
          <DialogDescription>
            Un canal es un espacio persistente para tu equipo, con roles y permisos propios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="channel-title">Nombre</Label>
            <Input
              id="channel-title"
              value={title}
              onChange={handleTitleChange}
              placeholder="general"
              autoFocus
            />
            {effectiveSlug && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">#{effectiveSlug}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="channel-description">Descripcion (opcional)</Label>
            <Textarea
              id="channel-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="De que trata este canal..."
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Canal publico</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Cualquiera en tu empresa puede encontrarlo y unirse.
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          <div className="space-y-1.5">
            <Label>Proyecto vinculado (opcional)</Label>
            <ComboboxField
              options={projectsQuery.data ?? []}
              value={linkedProjectId}
              onChange={setLinkedProjectId}
              placeholder="Buscar proyecto..."
              emptyText={projectsQuery.isLoading ? "Cargando..." : "Sin resultados"}
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Un proyecto puede tener varios canales.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose?.(); reset(); }} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={!title.trim() || isPending}>
            {isPending ? "Creando..." : "Crear canal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
