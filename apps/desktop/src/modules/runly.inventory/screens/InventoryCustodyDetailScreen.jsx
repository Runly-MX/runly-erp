import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button, Card, CheckboxField, ConfirmDialog, DataTable, DetailSkeleton, ErrorState, PageHeader, TextareaField,
} from '@runly/ui'
import { Ban, CheckCheck, Download, Eye, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useCancelCustody, useCompleteCustody, useCustody, useCustodyFileUrl } from '../hooks/useInventoryCustody.js'
import { CUSTODY_KIND, formatCustodyDate } from '../lib/custody-api.js'
import { CustodyStatusBadge } from '../components/custody/CustodyStatusBadge.jsx'
import { CustodySignaturesSection } from '../components/custody/CustodySignaturesSection.jsx'
import { CustodyEditorSheet } from '../components/custody/CustodyEditorSheet.jsx'

const LIST_PATH = '/app/m/runly.inventory/inventory/custodies'

const ITEM_COLUMNS = [
  { id: 'index', header: '#', enableSorting: false, cell: ({ row }) => <span className="tabular-nums text-[hsl(var(--muted-foreground))]">{row.index + 1}</span> },
  { accessorKey: 'typeBrand', header: 'Tipo / marca', cell: ({ row }) => row.original.typeBrand || '—' },
  { accessorKey: 'model', header: 'Modelo', cell: ({ row }) => row.original.model || '—' },
  { accessorKey: 'serialNumber', header: 'Serie', cell: ({ row }) => <span className="font-mono text-xs">{row.original.serialNumber || '—'}</span> },
  { accessorKey: 'assetTag', header: 'Etiqueta', cell: ({ row }) => <span className="font-mono text-xs">{row.original.assetTag || '—'}</span> },
  { accessorKey: 'invoiceNumber', header: 'Factura', cell: ({ row }) => row.original.invoiceNumber || '—' },
  { accessorKey: 'features', header: 'Características', cell: ({ row }) => <span className="line-clamp-2">{row.original.features || '—'}</span> },
]

export default function InventoryCustodyDetailScreen() {
  const { '*': wildcard } = useParams()
  const id = useMemo(() => (wildcard ?? '').split('/')[2] ?? null, [wildcard])
  const navigate = useNavigate()
  const { data: custody, isLoading, isError, refetch } = useCustody(id)
  const complete = useCompleteCustody()
  const cancel = useCancelCustody()
  const fileUrl = useCustodyFileUrl()
  const [editing, setEditing] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [allowUnsigned, setAllowUnsigned] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (isLoading) return <div className="p-4 md:p-6"><DetailSkeleton /></div>
  if (isError || !custody) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState title="Resguardo no encontrado" description="Puede que se haya eliminado o que no tengas acceso." onRetry={refetch} />
      </div>
    )
  }

  const open = custody.status === 'DRAFT' || custody.status === 'PENDING_SIGNATURE'

  async function openFile(mode) {
    try {
      const { url } = await fileUrl.mutateAsync({ id: custody.id, mode })
      if (!url) throw new Error('El documento no está disponible')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo abrir el documento')
    }
  }

  async function handleComplete() {
    try {
      await complete.mutateAsync({ id: custody.id, ...(allowUnsigned ? { allowUnsigned: true } : {}) })
      toast.success('Resguardo completado', { description: 'Se generó el documento y se actualizaron las asignaciones.' })
      setCompleteOpen(false)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo completar el resguardo')
    }
  }

  async function handleCancel() {
    if (!reason.trim()) {
      toast.error('Escribe el motivo de la cancelación')
      return
    }
    try {
      await cancel.mutateAsync({ id: custody.id, reason: reason.trim() })
      toast.success('Resguardo cancelado')
      setCancelOpen(false)
      setReason('')
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo cancelar el resguardo')
    }
  }

  return (
    <div className="min-h-dvh space-y-6 p-4 md:p-6">
      <PageHeader
        eyebrow="Runly Inventario · Resguardos"
        title={custody.folio ?? 'Resguardo'}
        description={`${CUSTODY_KIND[custody.kind] ?? custody.kind} · ${custody.employeeName} · ${formatCustodyDate(custody.date)}`}
        onBack={() => navigate(LIST_PATH)}
        actions={(
          <div className="flex flex-wrap gap-2">
            {custody.status === 'DRAFT' ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button>
            ) : null}
            {open ? (
              <Button variant="outline" size="sm" onClick={() => openFile('preview')} disabled={fileUrl.isPending}>
                <Eye className="mr-1.5 h-3.5 w-3.5" />Vista previa
              </Button>
            ) : null}
            {custody.hasDocument ? (
              <Button variant="outline" size="sm" onClick={() => openFile('document')} disabled={fileUrl.isPending}>
                <Download className="mr-1.5 h-3.5 w-3.5" />Descargar documento
              </Button>
            ) : null}
            {open ? (
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}><Ban className="mr-1.5 h-3.5 w-3.5" />Cancelar resguardo</Button>
            ) : null}
            {open ? (
              <Button size="sm" onClick={() => { setAllowUnsigned(false); setCompleteOpen(true) }}><CheckCheck className="mr-1.5 h-3.5 w-3.5" />Completar</Button>
            ) : null}
          </div>
        )}
      />

      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Estado"><CustodyStatusBadge status={custody.status} /></Field>
        <Field label="Colaborador">{custody.employeeName}</Field>
        <Field label="Entrega">{custody.delivererName || '—'}</Field>
        <Field label="Artículos">{custody.itemCount}</Field>
        {custody.comments ? <Field label="Comentarios" wide>{custody.comments}</Field> : null}
        {custody.status === 'CANCELLED' && custody.cancelReason ? <Field label="Motivo de cancelación" wide>{custody.cancelReason}</Field> : null}
      </Card>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Artículos del resguardo</h3>
        <DataTable columns={ITEM_COLUMNS} data={custody.items} getRowId={(row) => row.id ?? row.itemId}
          showToolbar={false} showPagination={custody.items.length > 10} emptyTitle="Sin artículos" />
      </section>

      {custody.status !== 'CANCELLED' ? <CustodySignaturesSection custody={custody} /> : null}

      <CustodyEditorSheet open={editing} onOpenChange={setEditing} custody={custody} />

      <ConfirmDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title="Completar resguardo"
        description={custody.kind === 'RETURN'
          ? 'Se generará el documento final y los artículos quedarán devueltos. El resguardo ya no podrá editarse.'
          : 'Se generará el documento final y los artículos quedarán asignados al colaborador. El resguardo ya no podrá editarse.'}
        confirmLabel="Completar"
        loading={complete.isPending}
        onConfirm={handleComplete}
      >
        {!custody.receiverSigned ? (
          <CheckboxField checked={allowUnsigned} onChange={(e) => setAllowUnsigned(Boolean(e?.target ? e.target.checked : e))}
            label="Completar sin la firma del colaborador" hint="Queda registrado en la bitácora." />
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar resguardo"
        description="El resguardo quedará cancelado y no podrá completarse. Para corregirlo, crea uno nuevo."
        confirmLabel="Cancelar resguardo"
        cancelLabel="Volver"
        loading={cancel.isPending}
        onConfirm={handleCancel}
      >
        <TextareaField label="Motivo" required value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}
          placeholder="Por qué se cancela este resguardo" />
      </ConfirmDialog>
    </div>
  )
}

function Field({ label, wide, children }) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-4' : undefined}>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}
