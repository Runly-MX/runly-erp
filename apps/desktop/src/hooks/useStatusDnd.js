import { createContext, useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthProvider";
import { runly } from "../lib/runly";

// Own status and Do Not Disturb, and the lookup of other people's status. Spec
// docs/superpowers/specs/2026-10-26-status-and-dnd-design.md.
export function useMyStatus() {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["my-status"],
    queryFn: () => runly.notifications.getMyStatus(token).then((res) => res?.data ?? null),
    enabled: Boolean(token),
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: (status) => runly.notifications.setMyStatus(token, status),
    onSuccess: (res) => { queryClient.setQueryData(["my-status"], res?.data ?? null); queryClient.invalidateQueries({ queryKey: ["status-lookup"] }); },
    onError: (error) => toast.error("No se pudo guardar el estado", { description: error?.message }),
  });
  return { status: query.data ?? null, save };
}

export function useDnd() {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["my-dnd"],
    queryFn: () => runly.notifications.getDnd(token).then((res) => res?.data ?? null),
    enabled: Boolean(token),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const save = useMutation({
    mutationFn: (dnd) => runly.notifications.setDnd(token, dnd),
    onSuccess: (res) => { queryClient.setQueryData(["my-dnd"], res?.data ?? null); queryClient.invalidateQueries({ queryKey: ["status-lookup"] }); },
    onError: (error) => toast.error("No se pudo guardar No molestar", { description: error?.message }),
  });
  return { dnd: query.data ?? null, save };
}

// Status of the people in the open conversation, so message headers can show it without each asking.
export const StatusLookupContext = createContext({});
export const useStatusOf = (userId) => useContext(StatusLookupContext)?.[userId] ?? null;

// { [userId]: { emoji, text, dnd } } for the given people (those with neither are absent).
export function useStatusLookup(userIds) {
  const { session } = useAuth();
  const token = session?.access_token;
  const ids = [...new Set((userIds ?? []).filter(Boolean))].sort().slice(0, 200);
  const query = useQuery({
    queryKey: ["status-lookup", ids.join(",")],
    queryFn: () => runly.notifications.statusLookup(token, ids).then((res) => res?.data ?? {}),
    enabled: Boolean(token && ids.length),
    staleTime: 60_000,
    refetchInterval: 3 * 60_000,
  });
  return query.data ?? {};
}
