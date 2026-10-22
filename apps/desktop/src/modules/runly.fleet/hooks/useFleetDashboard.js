import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

// Key starts with "fleet" so the realtime provider's fleet.changed invalidation
// reaches it; the short staleTime keeps the page honest when focus returns.
export function useFleetDashboard(months = 12) {
  const token = useAuth().session?.access_token ?? null;
  return useQuery({
    queryKey: ["fleet", "dashboard", months],
    queryFn: () => runly.fleet.getDashboard({ months }, token).then((res) => res?.data ?? res),
    enabled: Boolean(token),
    staleTime: 15 * 1000,
    refetchOnWindowFocus: true,
  });
}
