import {useQuery} from '@tanstack/react-query'
import {useAuth} from '../../../auth/AuthProvider.jsx'
import {runly} from '../../../lib/runly.js'
import {documentAssetIds} from '../../../../../shared/studio/shape-properties.js'
import {StudioThumbnail} from './StudioThumbnail.jsx'

// Same presentation; template capabilities never become generic Files grants.
export function StudioTemplateThumbnail({templateId,document,...props}) {
  const auth=useAuth(),token=auth?.session?.access_token
  const ids=documentAssetIds({objects:(document?.objects??[]).filter(o=>!o.hidden)}).slice(0,6).sort()
  const {data:images}=useQuery({
    queryKey:['studio','template-images',auth?.session?.user?.id,auth?.profileCompanyId,templateId,ids],
    enabled:Boolean(token&&templateId&&ids.length),staleTime:30_000,gcTime:60_000,refetchInterval:45_000,
    queryFn:async({signal})=>Object.fromEntries(await Promise.all(ids.map(async id=>{
      try{const response=await runly.studio.templateAssetUrl(templateId,id,token,signal);return [id,(response?.data??response).signedUrl]}catch{return [id,null]}
    }))),
  })
  return <StudioThumbnail document={document} images={images} {...props}/>
}
