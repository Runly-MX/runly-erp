import { useState } from "react";
import { toast } from "sonner";
import { Phone } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, ComboboxField, Button, personSelectOption,
} from "@runly/ui";
import { useQuickActionStore } from "../../../lib/quickActionStore";
import { NewMeetingDialog } from "./NewMeetingDialog";
import { useCalls } from "../calls/CallsProvider";
import { useCompanyPeople, useStartDirectChat } from "../hooks/useCompanyPeople";

function CallPersonDialog({ open, onClose }) {
  const { people } = useCompanyPeople();
  const { enabled, startCall, isStarting, activeCall } = useCalls();
  const [personId, setPersonId] = useState("");
  const { start, startingId } = useStartDirectChat(async (conversation) => {
    try {
      await startCall({ conversationId: conversation.id, kind: "AUDIO" });
      onClose();
    } catch {
      toast.error("No se pudo iniciar la llamada.");
    }
  });
  const person = people.find((p) => p.id === personId);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Llamar a una persona</DialogTitle>
          <DialogDescription>Llamada de audio directa; suena en sus dispositivos.</DialogDescription>
        </DialogHeader>
        {!enabled ? (
          <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
            Las llamadas no están configuradas en esta instancia.
          </p>
        ) : (
          <div className="space-y-4">
            <ComboboxField
              label="Persona"
              placeholder="Buscar persona..."
              value={personId}
              onValueChange={setPersonId}
              options={people.map((p) => personSelectOption(p))}
            />
            {activeCall && (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Ya tienes una llamada en curso.</p>
            )}
            <Button
              type="button"
              className="w-full"
              disabled={!person || isStarting || Boolean(activeCall) || Boolean(startingId)}
              onClick={() => start(person)}
            >
              <Phone className="mr-2 h-4 w-4" /> {startingId ? "Conectando..." : "Llamar"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Renders the dialogs behind runly.chat's quick actions (command palette).
export function ChatQuickActionsHost() {
  const request = useQuickActionStore((s) => s.request);
  const close = useQuickActionStore((s) => s.close);
  // Mounted only on demand so the dialogs' queries don't run for everyone.
  if (!request) return null;
  return (
    <>
      <NewMeetingDialog
        open={request?.id === "meeting"}
        onOpenChange={(next) => { if (!next) close(); }}
        initialMode={request?.props?.mode}
      />
      <CallPersonDialog open={request?.id === "call-person"} onClose={close} />
    </>
  );
}
