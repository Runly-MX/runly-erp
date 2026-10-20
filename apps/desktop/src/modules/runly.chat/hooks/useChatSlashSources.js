import { useMemo } from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { useEntityBranding } from "./useEntityBranding";
import { ENTITY_TYPE_BY_VALUE, SLASH_SOURCES, SERVER_SEARCH_TYPES, fetchEntityOptions, matchesConnectorSearch } from "../lib/entityReferenceTypes";

// Sources for the composer's /module:search shortcuts (MentionTextarea
// `slashSources`). Server-searched modules query as the user types; the rest
// filter their cached first page.
export function useChatSlashSources() {
  const { session } = useAuth();
  const token = session?.access_token;
  const brandOf = useEntityBranding();
  return useMemo(() => {
    if (!token) return [];
    return SLASH_SOURCES
      .filter((source) => source.key !== "task" && ENTITY_TYPE_BY_VALUE[source.key])
      .map((source) => ({
        ...source,
        Icon: brandOf(source.key).Icon,
        color: brandOf(source.key).color,
        search: async (query) => {
          const options = await fetchEntityOptions(source.key, token, query);
          const matches = SERVER_SEARCH_TYPES.has(source.key) ? options : options.filter((o) => matchesConnectorSearch(o, query));
          return matches.slice(0, 12).map((o) => ({
            id: `${source.key}:${o.value}`,
            displayName: o.label,
            description: o.subtitle ?? undefined,
            entity: { entityType: source.key, recordId: o.value },
          }));
        },
      }));
  }, [token, brandOf]);
}
