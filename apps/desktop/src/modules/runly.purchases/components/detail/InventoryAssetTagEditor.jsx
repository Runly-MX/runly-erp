import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField } from '@runly/ui'
import { useInventoryItem, useUpdateInventoryItem } from '../../../runly.inventory/hooks/useInventoryItems.js'

// Uses the existing Inventarios read/write contracts, including effective area
// access. The purchase relation never stores a copy of the asset number.
export function InventoryAssetTagEditor({ item }) {
  const query = useInventoryItem(item.id)
  const update = useUpdateInventoryItem()
  const [snapshot, setSnapshot] = useState(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const detail = query.data?.data ?? query.data

  async function load() {
    const result = await query.refetch()
    const current = result.data?.data ?? result.data
    if (result.isError || !current?.canUpdate) {
      toast.error('No tienes acceso para modificar este activo.')
      setSnapshot(null)
      return
    }
    setSnapshot(current); setValue(current.assetTag ?? ''); setError(''); setStale(false)
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    try {
      await update.mutateAsync({ id: item.id, assetTag: value.trim() || null, expectedUpdatedAt: snapshot.updatedAt })
      setSnapshot(null)
      toast.success('Número de activo actualizado en Inventarios')
    } catch (failure) {
      setError(failure.details?.error ?? failure.message ?? 'No se pudo guardar el número de activo.')
      setStale(failure.details?.code === 'STALE_ITEM')
    }
  }

  return <>
    {detail?.canUpdate ? <Button variant="ghost" size="icon-sm" aria-label={`Editar número de activo de ${item.label}`} title="Editar número de activo" disabled={query.isFetching} onClick={load}><Pencil className="h-4 w-4" /></Button> : null}
    <Dialog open={Boolean(snapshot)} onOpenChange={open => { if (!open && !update.isPending) setSnapshot(null) }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Editar número de activo</DialogTitle><DialogDescription>{item.label}. Se actualiza el mismo bien en Inventarios.</DialogDescription></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <TextField label="Número de activo" placeholder="Opcional" maxLength={100} value={value} onChange={e => setValue(e.target.value)} disabled={update.isPending} error={error && !stale ? error : undefined} />
          {stale ? <Alert variant="warning"><AlertDescription>{error} Tu captura se conserva; recarga para revisar el valor actual.</AlertDescription><Button type="button" variant="outline" onClick={load}>Recargar datos</Button></Alert> : null}
          <p className="text-xs text-muted-foreground">Las etiquetas físicas impresas conservan su texto. Puedes reimprimirlas desde la ficha de Inventarios.</p>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setSnapshot(null)} disabled={update.isPending}>Cancelar</Button><Button type="submit" disabled={update.isPending || stale}>Guardar número de activo</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>
}
