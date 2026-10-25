import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { runly } from "../lib/runly";
import { ModuleContributedWidget } from "../app/home/widgets/ModuleContributedWidget";

// Widgets that Builder modules contribute, shaped like the built-in registry entries
// ({ id, title, description, moduleKey, Component }) so Home treats both the same.
export function useContributedWidgets() {
  const { session } = useAuth();
  const token = session?.access_token;
  const { data } = useQuery({
    queryKey: ["home-widgets", token],
    queryFn: async () => (await runly.modules.homeWidgets(token))?.data ?? [],
    enabled: Boolean(token),
    staleTime: 300_000,
    retry: false,
  });
  // Memoized: a new Component identity per render would remount every widget.
  return useMemo(() => (data ?? []).map((widget) => ({
    id: `module:${widget.moduleKey}:${widget.key}`,
    title: widget.label,
    description: `Widget de ${widget.moduleName}`,
    moduleKey: widget.moduleKey,
    Component: ({ module }) => <ModuleContributedWidget module={module} widget={widget} />,
  })), [data]);
}
