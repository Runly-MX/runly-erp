import { useState } from 'react'
import { AdvancedFileViewer, Alert, ErrorState, PageHeader, RecordHeader, SectionCard, Skeleton } from '@runly/ui'
import { ArchiveX, ArrowLeft, Boxes, IdCard, ImageOff, Info, ListPlus, MapPin, Pencil, ShieldCheck, StickyNote } from 'lucide-react'
import { useGuestItem } from '../../hooks/useInventoryGuest.js'
import { guestItemActions } from '../../lib/guest-admin.js'
import { GUEST_STATUS_LABEL } from '../../lib/guest-session.js'
import { InventoryAdminStatusBadge } from '../InventoryAdminStatusBadge.jsx'
import { GuestItemFiles } from './GuestItemFiles.jsx'
import { GuestProposeDeregistrationDialog } from './GuestProposeDeregistrationDialog.jsx'
import { muted } from './GuestPortalParts.jsx'

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
  const [coverOpen, setCoverOpen] = useState(false)
  const data = query.data

  if (query.isLoading) return <div className="space-y-3"><PageHeader title="Cargando..." onBack={onBack} /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>
  if (query.isError || !data) {
    return <div className="space-y-3"><PageHeader title="Item" onBack={onBack} /><ErrorState title="No se pudo cargar el item" description={query.error?.message} onRetry={() => query.refetch()} showReport={false} /></div>
  }

  const actions = guestItemActions({ canWrite: data.canWrite, adminStatus: data.adminStatus })
  const customs = (data.customValues ?? []).map((cv) => [cv.label, customValueText(cv)]).filter(([, v]) => v)

  return (
    <div className="space-y-4 pb-6">
      <RecordHeader
        sticky={false}
        crumbs={[{ label: 'Inventario', onClick: onBack }, { label: data.name }]}
        title={data.name}
        subtitle={[data.folio, areaName].filter(Boolean).join(' · ') || undefined}
        badge={<InventoryAdminStatusBadge status={data.adminStatus} />}
        actions={[
          { key: 'back', label: 'Volver', icon: <ArrowLeft className="h-4 w-4" />, placement: 'collapse', onClick: onBack },
          { key: 'propose', label: 'Proponer baja', icon: <ArchiveX className="h-4 w-4" />, placement: 'menu', destructive: true, hidden: !actions.canProposeDeregistration, onClick: () => setProposeOpen(true) },
          { key: 'edit', label: 'Editar', icon: <Pencil className="h-4 w-4" />, variant: 'default', hidden: !actions.canEdit, onClick: () => onEdit(data.id) },
        ]}
      />
      {actions.banner ? <Alert variant={actions.banner.tone}><Info className="h-4 w-4" /><p className="text-sm">{actions.banner.text}</p></Alert> : null}
      {!data.canWrite ? <Alert><Info className="h-4 w-4" /><p className="text-sm">Tu acceso a{areaName ? ` «${areaName}»` : ' esta carpeta'} es de solo lectura, por eso no ves el botón Editar. Pide al equipo que te cambie el permiso a Editor.</p></Alert> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <SectionCard padded={false} className="overflow-hidden">
            <div className="flex items-center gap-4 p-4">
              <button type="button" disabled={!data.coverUrl} onClick={() => setCoverOpen(true)} aria-label="Ver imagen"
                className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                {data.coverUrl ? <img src={data.coverUrl} alt="" className="h-full w-full object-cover" /> : <ImageOff className={`h-5 w-5 ${muted}`} />}
              </button>
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

          <SectionCard title="Clasificación" icon={Boxes}>
            <dl className={divider}>
              <Row label="Modelo">{data.model}</Row>
              <Row label="Tipo">{data.categoryName}</Row>
              <Row label="Marca">{data.brandName}</Row>
            </dl>
          </SectionCard>
          <SectionCard title="Identificación" icon={IdCard}>
            <dl className={divider}>
              <Row label="Folio">{mono(data.folio)}</Row>
              <Row label="Número de serie">{mono(data.serialNumber)}</Row>
              <Row label="Número de activo">{mono(data.assetTag)}</Row>
              <Row label="Número de parte">{data.partNumber}</Row>
            </dl>
          </SectionCard>
          <SectionCard title="Ubicación y estado" icon={MapPin}>
            <dl className={divider}>
              <Row label="Carpeta">{areaName}</Row>
              <Row label="Ubicación">{data.locationName}</Row>
              <Row label="Disponibilidad">{GUEST_STATUS_LABEL[data.status] ?? data.status}</Row>
              <Row label="Condición">{data.conditionName}</Row>
            </dl>
          </SectionCard>
          {data.warrantyExpiry || data.warrantyNotes ? (
            <SectionCard title="Garantía" icon={ShieldCheck}>
              <dl className={divider}><Row label="Vencimiento">{warranty(data.warrantyExpiry)}</Row></dl>
              {data.warrantyNotes ? <p className="mt-2 whitespace-pre-line text-sm">{data.warrantyNotes}</p> : null}
            </SectionCard>
          ) : null}
          {customs.length ? (
            <SectionCard title="Campos personalizados" icon={ListPlus}>
              <dl className={divider}>{customs.map(([label, value]) => <Row key={label} label={label}>{value}</Row>)}</dl>
            </SectionCard>
          ) : null}
          {data.notes ? <SectionCard title="Notas" icon={StickyNote}><p className="whitespace-pre-line text-sm">{data.notes}</p></SectionCard> : null}
        </div>
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <SectionCard><GuestItemFiles itemId={data.id} canWrite={actions.canEdit} /></SectionCard>
        </aside>
      </div>
      {coverOpen && data.coverUrl ? (
        <AdvancedFileViewer open onOpenChange={setCoverOpen} files={[{ id: data.id, originalName: data.name, mimeType: 'image/jpeg', url: data.coverUrl }]} activeIndex={0}
          onResolveSignedUrl={(file) => file.url} imageEditing={false} />
      ) : null}
      <GuestProposeDeregistrationDialog item={data} open={proposeOpen} onOpenChange={setProposeOpen} />
    </div>
  )
}
