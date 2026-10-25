// Dialogs of the personal sidebar sections: create / rename a section, and move a
// conversation to one. Spec docs/superpowers/specs/2026-10-26-chat-organization-design.md, section 1.
import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, IconPickerField, TextField } from "@runly/ui";
import { Check, FolderInput, FolderPlus } from "lucide-react";
import { MAX_NAME } from "../lib/sidebarSections";

// section: null to create, or the section being renamed.
export function SectionDialog({ open, section, onClose, onSave }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  useEffect(() => {
    if (open) { setName(section?.name ?? ""); setIcon(section?.icon ?? ""); }
  }, [open, section]);
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader icon={FolderPlus}><DialogTitle>{section ? "Editar sección" : "Nueva sección"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <TextField label="Nombre" value={name} maxLength={MAX_NAME} placeholder="Ej. Clientes" autoFocus onChange={(e) => setName(e.target.value)} />
          <IconPickerField label="Icono (opcional)" value={icon} onChange={setIcon} placeholder="Elegir icono" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), icon: icon || null })}>{section ? "Guardar" : "Crear sección"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// current: id of the section the conversation is in (or null = automatic).
export function MoveToSectionDialog({ open, conversationName, sections, current, onClose, onPick, onCreate }) {
  const Option = ({ id, label }) => (
    <button
      type="button"
      onClick={() => onPick(id)}
      className={["flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors [@media(pointer:coarse)]:min-h-11",
        current === id ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]" : "hover:bg-[hsl(var(--muted))]"].join(" ")}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {current === id && <Check className="h-4 w-4 shrink-0" aria-hidden />}
    </button>
  );
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader icon={FolderInput}><DialogTitle>Mover a sección</DialogTitle></DialogHeader>
        <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{conversationName}</p>
        <div className="max-h-72 space-y-0.5 overflow-y-auto py-2">
          <Option id={null} label="Automática (según su tipo)" />
          {sections.map((section) => <Option key={section.id} id={section.id} label={section.name} />)}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="outline" onClick={onCreate}><FolderPlus className="mr-1.5 h-4 w-4" aria-hidden /> Nueva sección</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
