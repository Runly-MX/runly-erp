// Picks a chat conversation for an automation (a channel to post in, a conversation
// to answer): the person's conversations of the given types, grouped, plus
// "Usar «...»" for an id or a name typed by hand (a conversation the person is not in).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreatableComboboxField } from "@runly/ui";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";
import { getConversationDisplayName } from "../../../runly.chat/lib/chatUtils";

const GROUPS = { channel: "Canales", group: "Grupos", direct: "Mensajes directos", external_support: "Chats externos" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ConversationPicker({ label, showLabel = false, types = ["channel"], value, readOnly, onChange, placeholder = "Elige una conversación", hint }) {
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const [term, setTerm] = useState("");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["chat-conversations"],
    queryFn: () => runly.chat.listConversations({}, token),
    enabled: Boolean(token),
    staleTime: 30_000,
  });
  const name = (conversation) => getConversationDisplayName(conversation, userProfile?.id);
  const options = (data?.data ?? [])
    .filter((conversation) => types.includes(conversation.type))
    .map((conversation) => ({ value: conversation.id, label: `${conversation.type === "channel" ? "# " : ""}${name(conversation)}`, group: types.length > 1 ? GROUPS[conversation.type] : undefined, keywords: conversation.id }));
  const current = value === undefined || value === null ? "" : String(value);
  // A channel saved by its name selects that channel; anything else typed stays as is.
  const byName = options.find((option) => option.label.replace(/^# /, "").toLowerCase() === current.toLowerCase());
  const selected = byName?.value ?? current;
  const all = !current || options.some((option) => option.value === selected)
    ? options
    : [{ value: current, label: UUID.test(current) ? `Id ${current.slice(0, 8)}…` : current, group: "Escrito a mano" }, ...options];
  const typed = term.trim();
  return (
    <CreatableComboboxField aria-label={label} label={showLabel ? label : undefined} options={all} value={selected} disabled={readOnly} placeholder={placeholder}
      searchPlaceholder="Busca o pega un id..." loading={isLoading} loadError={isError ? "No se pudieron cargar las conversaciones." : null} onRetry={refetch}
      emptyText="Sin conversaciones" hint={hint} clearable
      onSearchChange={setTerm} createLabel={typed ? `Usar «${typed.length > 40 ? `${typed.slice(0, 40)}…` : typed}»` : undefined}
      onCreate={(text) => onChange(text.trim() || null)}
      onValueChange={(next) => onChange(next || null)} />
  );
}
