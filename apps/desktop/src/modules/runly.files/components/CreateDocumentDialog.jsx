import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  TextField,
} from "@runly/ui";
import {
  LockKeyhole,
  FileText,
  FileSpreadsheet,
  Presentation,
} from "lucide-react";
import { runly } from "../../../lib/runly";
import { filesError } from "../lib/files-error";

const TYPES = {
  docx: { label: "Documento", Icon: FileText },
  xlsx: { label: "Hoja de cálculo", Icon: FileSpreadsheet },
  pptx: { label: "Presentación", Icon: Presentation },
};

export function CreateDocumentDialog({ format, token, folder = null, destination = "Mis archivos", onClose, onCreated }) {
  const { label, Icon } = TYPES[format];
  const [name, setName] = useState(`${label} sin título`);
  const request = useRef(null);
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => {
      if (request.current?.name !== name)
        request.current = {
          name,
          key: Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join(""),
        };
      return runly.files.createDocument(
        { format, name, requestKey: request.current.key, ...(folder ? { folderId: folder.id } : {}) },
        token,
      );
    },
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ["files-list"] });
      onCreated(data);
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !create.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            Crear {label.toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            Empieza en blanco y trabaja con tu equipo desde Runly. Se creará en <strong className="font-medium text-[hsl(var(--foreground))]">{destination}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-5"
        >
          <TextField
            id="document-name"
            label="Nombre del archivo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={170}
            required
            autoFocus
            disabled={create.isPending}
            hint={`Se creará un archivo .${format}`}
          />
          <div className="flex gap-3 rounded-xl bg-[hsl(var(--muted))] p-3 text-sm">
            <LockKeyhole className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Acceso restringido a ti y a los administradores. Después puedes
              invitar a otras personas.
            </p>
          </div>
          {create.isError && (
            <p role="alert" className="text-sm text-destructive">
              {filesError(create.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={create.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={create.isPending}
              disabled={!name.trim()}
            >
              Crear y abrir
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
