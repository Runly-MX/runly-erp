import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Button,ImageEditorDialog,TooltipProvider} from '@runly/ui'
function Fixture(){
  const [src,setSrc]=useState(null),[original,setOriginal]=useState(false)
  function open(full){
    const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1200;const ctx=canvas.getContext('2d')
    ctx.fillStyle='#14b8a6';ctx.fillRect(0,0,1200,1200);ctx.fillStyle='#d946ef';ctx.fillRect(1200,0,1200,1200)
    setOriginal(full);setSrc(canvas.toDataURL())
  }
  return <TooltipProvider><Button onClick={()=>open(true)}>Editar a resolución original</Button><Button onClick={()=>open(false)}>Editar modo Files/Notes</Button>
    <ImageEditorDialog open={Boolean(src)} src={src} originalResolution={original} mimeType="image/png" onOpenChange={open=>{if(!open)setSrc(null)}}
      onSave={async file=>{const image=await createImageBitmap(file);window.photoDialogResult={width:image.width,height:image.height,size:file.size};image.close();setSrc(null)}} />
  </TooltipProvider>
}
createRoot(document.getElementById('root')).render(<Fixture/> )
