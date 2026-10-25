import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { runly } from "../lib/runly";

// Widget ids that are offered even when the person cannot open their module because
// something is waiting for them there. Today: approvals of automations assigned to them
// (the API only asks for being the approver, not for the module permission).
export function usePendingWidgetAccess() {
  const { session } = useAuth();
  const token = session?.access_token;
  const { data } = useQuery({
    queryKey: ["pending-widget-access", "approvals", token],
    queryFn: async () => (await runly.modules.myAutomationApprovals(token))?.data ?? [],
    enabled: Boolean(token),
    staleTime: 60_000,
    retry: false,
  });
  return useMemo(() => (Array.isArray(data) && data.length > 0 ? ["approvals"] : []), [data]);
}
