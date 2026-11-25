import { useMemo,useState } from 'react';
import { AdvancedFileViewer } from '@runly/ui';
import { useFileContent } from '../hooks/useFileContent';
import { matchingWords,overlayRotation } from '../lib/content-overlay';
import { FileContentPanel } from './FileContentPanel';

function ContentOverlay({page,hits,active,rotation=0}) {
  const canvas=page?.engine?.canvas;
  if (!canvas || !hits.length) return null;
  const layout=overlayRotation(canvas.width,canvas.height,rotation);
  return <svg data-ocr-overlay="" role="img" aria-label="Coincidencias del texto reconocido" className="pointer-events-none absolute inset-0 h-full w-full"
    viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="none">
    <g transform={layout.transform}>{hits.map(word=><rect key={`${word.unit}:${word.index}`} x={word.x} y={word.y} width={word.width} height={word.height}
      fill={active?.unit===word.unit&&active?.index===word.index?'#fb923c':'#facc15'} fillOpacity="0.35" stroke="#f59e0b" strokeWidth={Math.max(1,canvas.width/1000)} />)}</g>
  </svg>;
}

export function FilesContentViewer(props) {
  const file=props.files?.[props.activeIndex];
  const content=useFileContent(file,props.open);
  const [selection,setSelection]=useState({fileId:null,query:'',index:0});
  const current=selection.fileId===file?.id?selection:{fileId:file?.id,query:'',index:0};
  const pages=content.isError?[]:content.data?.data?.pages??[];
  const query=current.query;
  const hits=useMemo(()=>matchingWords(pages,query),[pages,query]);
  const active=hits[Math.min(current.index,Math.max(0,hits.length-1))];
  const viewer={query:current.query,setQuery:query=>setSelection({fileId:file?.id,query,index:0}),
    count:hits.length,index:Math.min(current.index,Math.max(0,hits.length-1)),
    navigate:direction=>setSelection({...current,index:(current.index+direction+hits.length)%Math.max(1,hits.length)})};
  return <AdvancedFileViewer {...props} contentPanelKinds={['image','pdf']} requestedPdfPage={active?.unit}
    renderSidePanel={source=><FileContentPanel file={source} viewer={viewer} />}
    renderImageOverlay={()=><ContentOverlay page={pages[0]} hits={hits.filter(hit=>hit.unit===pages[0]?.unit)} active={active} />}
    renderPdfOverlay={(_source,{pageNumber,rotation})=><ContentOverlay page={pages.find(page=>page.unit===pageNumber)} hits={hits.filter(hit=>hit.unit===pageNumber)} active={active} rotation={rotation} />}
  />;
}
