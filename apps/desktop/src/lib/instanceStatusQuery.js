import { runly } from "./runly";

// One cache entry for GET /instance/status: boot, route guard, login and public site share it.
// CompanyBranding and the setup wizard already invalidate this key after a change.
export const instanceStatusQuery = {
  queryKey: ["instance-status"],
  queryFn: () => runly.instance.status(),
  staleTime: 30_000,
};
