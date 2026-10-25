import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { runly } from "../lib/runly";
import { moveInOrder, nextSize, toggleHidden } from "../lib/homeWidgets";

const PREF_KEY = "home.widgets";

// Per-user Home widget visibility. Stores the hidden ids (not the visible ones)
// so widgets added later show up by default.
export function useHomeWidgetPrefs() {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const debounceRef = useRef(null);
  const queryKey = ["user-preferences", PREF_KEY, token];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => runly.profile.getPreference(PREF_KEY, token),
    enabled: Boolean(token),
    staleTime: 300_000,
  });

  const mutation = useMutation({
    mutationFn: (value) => runly.profile.setPreference(PREF_KEY, value, token),
  });

  const hidden = Array.isArray(data?.value?.hidden) ? data.value.hidden : [];

  const order = Array.isArray(data?.value?.order) ? data.value.order : [];
  const sizes = data?.value?.size && typeof data.value.size === "object" ? data.value.size : {};

  // Saves the whole preference (hidden + order + size) a moment after the last change.
  function save(patch) {
    const next = { ...(data?.value ?? {}), ...patch };
    queryClient.setQueryData(queryKey, { value: next });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => mutation.mutate(next), 500);
  }

  const toggle = (id) => save({ hidden: toggleHidden(hidden, id) });
  // `ids` is the order on screen; moving rewrites the full order so it sticks.
  const move = (ids, id, delta) => save({ order: moveInOrder(ids, id, delta) });
  const cycleSize = (id) => save({ size: { ...sizes, [id]: nextSize(sizes[id]) } });

  return { hidden, order, sizes, isLoading, toggle, move, cycleSize };
}
