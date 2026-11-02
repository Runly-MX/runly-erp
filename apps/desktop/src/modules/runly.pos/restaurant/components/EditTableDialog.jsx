import {useState} from 'react'
import {Button,ConfirmDialog,NumberStepper,SwitchField,TextField} from '@runly/ui'
import {Pencil} from 'lucide-react'
import {runly} from '../../../../lib/runly.js'
import FormDialog from '../../../runly.catalog/components/FormDialog.jsx'
import CommandFailureAlert from '../../../runly.catalog/components/CommandFailureAlert.jsx'
import {usePosCommand} from '../../retail/hooks/usePosCommand.js'

export default function EditTableDialog({table,token,onClose,onUpdated,onConflict}) {
  const [name,setName]=useState(table.name),[capacity,setCapacity]=useState(table.capacity)
  const [enabled,setEnabled]=useState(table.enabled!==false),[error,setError]=useState(null)
  const [confirm,setConfirm]=useState(false)
  const command=usePosCommand({prefix:'table-edit',scope:table.id,
    run:(body,options)=>runly.commerce.updateTable(table.id,body,token,options),
    onSuccess:res=>onUpdated(res.data),
    onError:info=>{if(info.kind==='conflict')onConflict?.()},
  })
  const busy=command.isPending,occupied=Boolean(table.activeOrder||table.activeOrderId||table.reconciliationRequired)
  function submit(){
    if(busy||['lost','conflict'].includes(command.failure?.kind))return
    if(!name.trim()){setError('Escribe el nombre o número de la mesa.');return}
    setError(null)
    if(table.enabled!==false&&!enabled){setConfirm(true);return}
    save()
  }
  function save(){
    setConfirm(false)
    command.mutate({expectedVersion:table.version,name:name.trim(),capacity,enabled})
  }
  return <>
    <FormDialog open onOpenChange={v=>!v&&!busy&&onClose()} icon={Pencil} title={`Editar ${table.name}`} size="md"
      description="Nombre, capacidad y disponibilidad; no necesitas un plano." onSubmit={()=>!busy&&submit()}
      footer={<><Button type="button" variant="outline" size="lg" className="h-11" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button type="submit" size="lg" className="h-11" disabled={busy||command.failure?.kind==='lost'||command.failure?.kind==='conflict'}>Guardar mesa</Button></>}>
      <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={busy}/>
      {command.failure?.kind==='conflict'&&<p role="status">Cierra el formulario y vuelve a abrirlo para revisar los datos actuales.</p>}
      <TextField label="Nombre o número" value={name} onChange={e=>setName(e.target.value)} error={error} maxLength={100} disabled={busy} autoFocus/>
      <div className="space-y-2"><p className="text-sm font-medium">Capacidad</p><NumberStepper label="Capacidad de la mesa" value={capacity} onChange={setCapacity} min={1} max={99} disabled={busy}/></div>
      <SwitchField touchTarget id="table-enabled" label="Mesa habilitada" checked={enabled} onChange={setEnabled} disabled={busy||occupied}
        description={occupied?'Termina la cuenta antes de deshabilitar esta mesa.':'Puedes volver a habilitarla desde Mesas deshabilitadas.'}/>
    </FormDialog>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Deshabilitar ${table.name}`} description="Dejará de estar disponible para abrir cuentas. Su historial se conserva."
      confirmLabel="Deshabilitar mesa" onConfirm={save}/>
  </>
}
