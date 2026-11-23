import {useQuery} from '@tanstack/react-query'
import {useCallback,useMemo} from 'react'
import {companyFetch} from '../lib/companyFetch.js'
import {getApiUrl} from '../lib/runtimeConfig.js'
import {mapWebsiteImages} from '@runly/studio-interchange/website-document'

export function usePrivateWebsiteAssets({token,siteId,blocks}) {
 const query=useQuery({queryKey:['website-private-assets',siteId,token],enabled:Boolean(token&&siteId),queryFn:async()=>{
  const base=`${getApiUrl()}/website/sites/${siteId}/template-assets`,headers={Authorization:`Bearer ${token}`}
  const response=await companyFetch(base,{headers});if(!response.ok)throw Error('No se pudieron cargar los archivos privados del sitio.')
  const rows=(await response.json()).data
  return Promise.all(rows.map(async asset=>{
   const image=await companyFetch(`${base}/${asset.id}`,{headers});if(!image.ok)throw Error('Imagen privada no disponible.')
   // Audio/video (up to 64 MB) stays a Blob behind an object URL; images keep their data URL.
   const blob=await image.blob(),kind=/^video\//.test(asset.mime)?'video':/^audio\//.test(asset.mime)?'audio':'image'
   const url=kind!=='image'?URL.createObjectURL(blob):await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})
   return {...asset,kind,url}
  }))
 }})
 const mappings=useMemo(()=>({urls:new Map((query.data??[]).map(a=>[`file:${a.id}`,a.url])),refs:new Map((query.data??[]).map(a=>[a.url,`file:${a.id}`]))}),[query.data])
 const catalog=useCallback(page=>{const known=new Set(blocks.map(b=>b.type));return {blocks:[...blocks.map(b=>({type:b.type,fields:b.fields})),...Object.values(page.blocks).filter(b=>!known.has(b.type)).map(b=>({type:b.type,fields:{}}))]}},[blocks])
 const toView=useCallback(page=>mapWebsiteImages(page,catalog(page),value=>mappings.urls.get(value)??value),[catalog,mappings])
 const toStored=useCallback(page=>mapWebsiteImages(page,catalog(page),value=>mappings.refs.get(value)??value),[catalog,mappings])
 return {query,source:{list:async()=>query.data??[]},toView,toStored}
}
