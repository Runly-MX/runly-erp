import { useState } from 'react'
import { Alert, Button, ErrorState, PageHeader, SectionCard, Skeleton } from '@runly/ui'
import { ArchiveX, ImageOff, Info, Pencil } from 'lucide-react'
import { useGuestItem } from '../../hooks/useInventoryGuest.js'
import { guestItemActions } from '../../lib/guest-admin.js'
import { GUEST_STATUS_LABEL } from '../../lib/guest-session.js'
import { InventoryAdminStatusBadge } from '../InventoryAdminStatusBadge.jsx'
import { GuestItemFiles } from './GuestItemFiles.jsx'
import { GuestProposeDeregistrationDialog } from './GuestProposeDeregistrationDialog.jsx'
import { muted } from './GuestPortalParts.jsx'

const coarse = '[@media(pointer:coarse)]:min-h-11'
const divider = 'divide-y divide-[hsl(var(--border))]/60'

function Row({ label, children }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className={muted}>{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  )
}

function customValueText(cv) {
  if (cv.value === null || cv.value === undefined || String(cv.value).trim() === '') return null
  if (cv.fieldType === 'boolean') return String(cv.value).toLowerCase() === 'true' ? 'Sí' : null
  return String(cv.value)
}

const mono = (v) => (v ? <span className="font-mono">{v}</span> : null)
function warranty(iso) {
  const d = new Date(iso)
  return iso && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }) : null
}

// Item page: hero, grouped data and files. No history and no commercial or administrative data.
export function GuestItemDetailPage({ itemId, areaName, onBack, onEdit }) {
  const query = useGuestItem(itemId)
  const [proposeOpen, setProposeOpen] = useState(false)
  const data = query.data

  if (query.isLoading) return <div className="space-y-3"><PageHeader title="Cargando..." onBack={onBack} /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>
  if (query.isError || !data) {
    return <div className="space-y-3"><PageHeader title="Item" onBack={onBack} /><ErrorState title="No se pudo cargar el item" description={query.error?.message} onRetry={() => query.refetch()} showReport={false} /></div>
  }

  const actions = guestItemActions({ canWrite: data.canWrite, adminStatus: data.adminStatus })
  const customs = (data.customValues ?? []).map((cv) => [cv.label, customValueText(cv)]).filter(([, v]) => v)

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title={data.name}
        description={[data.folio, areaName].filter(Boolean).join(' · ') || undefined}
        onBack={onBack}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {actions.canProposeDeregistration ? (
              <Button type="button" variant="outline" className={coarse} onClick={() => setProposeOpen(true)}><ArchiveX className="mr-1.5 h-4 w-4" />Proponer baja</Button>
            ) : null}
            {actions.canEdit ? <Button type="button" className={coarse} onClick={() => onEdit(data.id)}><Pencil className="mr-1.5 h-4 w-4" />Editar</Button> : null}
          </div>
        )}
      />
      {actions.banner ? <Alert variant={actions.banner.tone}><Info className="h-4 w-4" /><p className="text-sm">{actions.banner.text}</p></Alert> : null}
      {!data.canWrite ? <Alert><Info className="h-4 w-4" /><p className="text-sm">Tu acceso es de solo lectura.</p></Alert> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <SectionCard padded={false} className="overflow-hidden">
            <div className="flex items-center gap-4 p-4">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[hsl(var(--muted))]">
                {data.coverUrl ? <img src={data.coverUrl} alt="" className="h-full w-full object-cover" /> : <ImageOff className={`h-5 w-5 ${muted}`} />}
              </span>
              <div className="min-w-0 space-y-1.5">
                <p className="truncate text-base font-semibold">{data.name}</p>
                <p className={`truncate text-sm ${muted}`}>{[data.categoryName, data.brandName, data.model].filter(Boolean).join(' · ') || 'Sin clasificar'}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <InventoryAdminStatusBadge status={data.adminStatus} />
                  {data.status ? <span className={`text-xs ${muted}`}>{GUEST_STATUS_LABEL[data.status] ?? data.status}</span> : null}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Clasificación">
            <dl className={divider}>
              <Row label="Modelo">{data.model}</Row>
              <Row label="Tipo">{data.categoryName}</Row>
              <Row label="Marca">{data.brandName}</Row>
            </dl>
          </SectionCard>
          <SectionCard title="Identificación">
            <dl className={divider}>
              <Row label="Folio">{mono(data.folio)}</Row>
              <Row label="Número de serie">{mono(data.serialNumber)}</Row>
              <Row label="Número de activo">{mono(data.assetTag)}</Row>
              <Row label="Número de parte">{data.partNumber}</Row>
            </dl>
          </SectionCard>
          <SectionCard title="Ubicación y estado">
            <dl className={divider}>
              <Row label="Ubicación">{data.locationName}</Row>
              <Row label="Disponibilidad">{GUEST_STATUS_LABEL[data.status] ?? data.status}</Row>
              <Row label="Condición">{data.conditionName}</Row>
            </dl>
          </SectionCard>
          {data.warrantyExpiry || data.warrantyNotes ? (
            <SectionCard title="Garantía">
              <dl className={divider}><Row label="Vencimiento">{warranty(data.warrantyExpiry)}</Row></dl>
              {data.warrantyNotes ? <p className="mt-2 whitespace-pre-line text-sm">{data.warrantyNotes}</p> : null}
            </SectionCard>
          ) : null}
          {customs.length ? (
            <SectionCard title="Campos personalizados">
              <dl className={divider}>{customs.map(([label, value]) => <Row key={label} label={label}>{value}</Row>)}</dl>
            </SectionCard>
          ) : null}
          {data.notes ? <SectionCard title="Notas"><p className="whitespace-pre-line text-sm">{data.notes}</p></SectionCard> : null}
        </div>
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <SectionCard><GuestItemFiles itemId={data.id} canWrite={actions.canEdit} /></SectionCard>
        </aside>
      </div>
      <GuestProposeDeregistrationDialog item={data} open={proposeOpen} onOpenChange={setProposeOpen} />
    </div>
  )
}
