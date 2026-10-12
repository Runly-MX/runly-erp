import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button } from "@runly/ui";
import { Video } from "lucide-react";
import { PreJoinPreview } from "./PreJoinPreview";
import "./ui/call-ui.css";

// "¿Listo para unirte?": check camera and microphone before entering a
// meeting that is already running.
export function PreJoinDialog({ open, onOpenChange, title = "Reunión", subtitle = null, name, defaultCamera = true, busy = false, onJoin }) {
  const [prefs, setPrefs] = useState({ mic: true, camera: defaultCamera });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="call-dialog">
        <DialogHeader>
          <DialogTitle>¿Listo para unirte?</DialogTitle>
          <DialogDescription>{subtitle ?? title}</DialogDescription>
        </DialogHeader>
        {open && <PreJoinPreview initialCamera={defaultCamera} name={name} onChange={setPrefs} />}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={() => onJoin(prefs)} disabled={busy}>
            <Video className="mr-2 h-4 w-4" /> {busy ? "Entrando..." : "Unirme ahora"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
