import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

export const PLATFORM_OWNER_QUERY_KEY = ["platform-owner"];

// { owner, isOwner, multiCompany, readOnly, isLoading }. readOnly: the instance
// hosts several companies and the viewer is not the platform owner, so
// instance-wide settings (General, Web Push) can only be viewed.
export function usePlatformOwner() {
  const { session } = useAuth();
  const token = session?.access_token;
  const query = useQuery({
    queryKey: PLATFORM_OWNER_QUERY_KEY,
    queryFn: () => runly.platform.getOwner(token),
    enabled: Boolean(token),
  });
  const data = query.data?.data ?? null;
  return {
    owner: data?.owner ?? null,
    isOwner: Boolean(data?.isOwner),
    multiCompany: Boolean(data?.multiCompany),
    readOnly: Boolean(data?.multiCompany && !data?.isOwner),
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
