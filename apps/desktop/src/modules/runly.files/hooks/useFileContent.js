import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../auth/AuthProvider';
import { useActiveCompany } from '../../../company/ActiveCompanyProvider';
import { runly } from '../../../lib/runly';

export function useFileContent(file,enabled=true,unit=null) {
  const {session,userProfile}=useAuth();
  const {activeCompanyId}=useActiveCompany();
  return useQuery({queryKey:['file-content',userProfile?.id,activeCompanyId,file?.id,file?.contentRevision,unit],
    queryFn:({signal})=>runly.contentIntelligence.result(file.id,session.access_token,unit,signal),enabled:Boolean(enabled&&session?.access_token&&file?.id),
    staleTime:2000,gcTime:0,refetchInterval:query=>['pending','processing'].includes(query.state.data?.data?.state)||['pending','processing'].includes(query.state.data?.data?.searchablePdf?.state)?4000:false});
}
