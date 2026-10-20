import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { getModuleIconComponent } from "@runly/ui";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { mergeRuntimeModules } from "../../../lib/runtimeModules";
import { ENTITY_TYPE_BY_VALUE, entityTypeColor } from "../lib/entityReferenceTypes";

// Which module owns each connector type - its icon and color are the ones
// the module has everywhere else (launcher, sidebar), so a mention looks the
// same as the module it points to.
const MODULE_BY_ENTITY = {
  contact: "runly.contacts",
  hr_employee: "runly.hr",
  inventory_item: "runly.inventory",
  vehicle: "runly.fleet",
  purchase_order: "runly.purchases",
  purchase_invoice: "runly.purchases",
  purchase_case: "runly.purchases",
  pos_order: "runly.pos",
  project: "runly.projects",
  task: "runly.projects",
  calendar_event: "runly.calendar",
  ledger_account: "runly.ledger",
  file: "runly.files",
};

// Shared with useRuntimeModules (same query key and fetcher), reduced to the
// two fields needed here; `select` keeps it cheap with many chips on screen.
const selectBranding = (data) => {
  const modules = mergeRuntimeModules(data, { includeManifestFallback: false, preferApiNavigation: true });
  return new Map(modules.map((m) => [m.key, { icon: m.icon ?? m.manifest?.icon ?? null, color: m.color ?? m.manifest?.color ?? null }]));
};

// Returns (entityType) => { Icon, color } using the owning module's branding,
// falling back to the generic per-type icon while modules load.
export function useEntityBranding() {
  const { session } = useAuth();
  const token = session?.access_token;
  const authUserId = session?.user?.id ?? "anonymous";
  const { data: byModule } = useQuery({
    queryKey: ["runtime-modules", authUserId],
    queryFn: () => runly.runtime.modules(token),
    enabled: Boolean(token),
    staleTime: 60000,
    select: selectBranding,
  });
  return useCallback((entityType) => {
    const branding = byModule?.get(MODULE_BY_ENTITY[entityType]);
    return {
      Icon: getModuleIconComponent(branding?.icon) ?? ENTITY_TYPE_BY_VALUE[entityType]?.Icon ?? ExternalLink,
      color: branding?.color ?? entityTypeColor(entityType),
    };
  }, [byModule]);
}
