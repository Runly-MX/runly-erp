import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { runly } from "../lib/runly";


// Per-user Home board: which widgets are shown (in order) and how big each one is.
// `pref` is the saved value as is; lib/homeWidgets.js turns it into what to render.
export function useHomeWidgetPrefs(PREF_KEY = "home.widgets") {
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
  const mutation = useMutation({ mutationFn: (value) => runly.profile.setPreference(PREF_KEY, value, token) });

  const pref = data?.value ?? {};
  // Shows the change at once and saves a moment after the last one.
  // `change` is the new value or a function of the latest saved one, so quick successive
  // changes (two arrow presses) build on each other instead of on a stale render.
  function save(change) {
    const current = queryClient.getQueryData(queryKey)?.value ?? {};
    const next = typeof change === "function" ? change(current) : change;
    queryClient.setQueryData(queryKey, { value: next });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => mutation.mutate(next), 500);
  }

  return { pref, isLoading, save };
}
