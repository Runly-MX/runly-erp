// People of the active company chosen for an automation block (notification
// recipients, approvers): each one shown with their profile photo, plus a picker
// to add more. Shares the `builder-people` query with the rest of the editor.
import { useQuery } from "@tanstack/react-query";
import { PersonAvatar, SelectField } from "@runly/ui";
import { X } from "lucide-react";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";

export function PeoplePicker({ label, value, onChange, readOnly = false, max = 100, emptyText = "Aún no eliges a nadie." }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const people = useQuery({
    queryKey: ["builder-people"],
    queryFn: async () => (await runly.modules.builderPeople(token))?.data ?? [],
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });
  const list = people.data ?? [];
  const personOf = (id) => list.find((person) => person.id === id) ?? null;
  const options = list.filter((person) => !value.includes(person.id)).map((person) => ({ value: person.id, label: person.name }));
  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      {value.length === 0 ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{emptyText}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const person = personOf(id);
            const name = person?.name ?? "Persona";
            return (
              <li key={id} className="flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 py-1 pl-1 pr-1.5 text-sm">
                <PersonAvatar name={name} src={person?.avatarUrl ?? null} size="sm" className="h-6 w-6" />
                <span className="max-w-[12rem] truncate">{name}</span>
                {!readOnly && (
                  <button type="button" aria-label={`Quitar a ${name}`} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--card))] hover:text-[hsl(var(--foreground))] [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9" onClick={() => onChange(value.filter((item) => item !== id))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && value.length < max && (
        <SelectField aria-label={label ? `Agregar: ${label}` : "Agregar persona"} options={options} value="" placeholder="Agregar persona..." onValueChange={(id) => id && onChange([...value, id])} />
      )}
    </div>
  );
}
