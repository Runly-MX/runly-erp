import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from "@runly/ui";
import { KeyRound } from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { parseMeetingInput } from "./lib/meetingInput";

// "Unirse con un ID": a member of the room goes straight in (or to the room's
// chat when nobody is in it yet); anyone else continues on the guest page.
export function JoinByIdDialog({ open, onOpenChange, onJoinLive, onOpenConversation }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const parsed = parseMeetingInput(value);

  const close = () => { setValue(""); setError(null); onOpenChange(false); };

  async function submit() {
    if (!parsed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runly.calls.resolveLink(parsed.token ? { token: parsed.token } : { code: parsed.code }, session?.access_token);
      const data = res?.data;
      close();
      if (!data?.member) navigate(parsed.guestPath);
      else if (data.live?.call?.status === "ACTIVE") onJoinLive(data.live);
      else onOpenConversation(data.conversationId);
    } catch (err) {
      setError(err?.status === 404 ? "No encontramos una reunión con ese ID." : err?.message ?? "No se pudo buscar la reunión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent size="md">
        <DialogHeader icon={KeyRound}>
          <DialogTitle>Unirse con un ID</DialogTitle>
          <DialogDescription>Escribe el ID de la reunión o pega el enlace que te compartieron.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            autoFocus
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            placeholder="abc-d234-5"
            aria-label="ID de la reunión o enlace"
            className="font-mono tracking-wider"
            autoComplete="off"
            spellCheck={false}
          />
          {error && <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>Cancelar</Button>
          <Button type="submit" onClick={submit} disabled={!parsed || busy}>{busy ? "Buscando…" : "Unirse"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
