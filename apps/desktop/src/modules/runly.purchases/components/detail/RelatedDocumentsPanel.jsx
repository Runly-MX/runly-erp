import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2, Unlink } from 'lucide-react'
import { Button, EmptyState } from '@runly/ui'
import { PurchaseStatusBadge } from '../PurchaseStatusBadge.jsx'
import { MoneyText } from '../MoneyText.jsx'
import { KINDS, docPath, kindOf, toAppPath } from '../../lib/purchases-constants.js'
import { formatDate } from '../../lib/format.js'
import { isInventoryRelation } from './InventoryRelationsPanel.jsx'
import { UnlinkRelationDialog } from './UnlinkRelationDialog.jsx'

const GROUP_ORDER = ['cases', 'requests', 'quotes', 'orders', 'receipts', 'invoices']
// Structural links the API refuses to remove (case membership, order -> receipt).
const PROTECTED = new Set(['CONTAINS', 'RECEIVED_BY'])

// Every purchase document connected to this one, from hydrated relations and
// the bundle arrays (orders, invoices, receipts, quotes) the API returns.
export function collectRelated(doc) {
  const map = new Map()
  const add = (kind, row) => {
    if (!kind || !row?.id || row.id === doc.id) return
    const key = `${kind}:${row.id}`
    // Bundle rows come after the relations: keep the relation id/type already seen.
    map.set(key, { ...map.get(key), kind, ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) })
  }
  for (const r of doc.relations ?? []) {
    if (isInventoryRelation(r)) continue
    add(kindOf(r.other?.type), { id: r.other.id, number: r.other.label, sublabel: r.other.sublabel, status: r.other.status, total: r.other.total, currency: r.other.currency, path: r.other.path, origin: r.origin, relationId: r.id, relationType: r.relationType })
  }
  for (const key of ['orders', 'invoices', 'receipts', 'requests']) (doc[key] ?? []).forEach((row) => add(key, row))
  return GROUP_ORDER.map((kind) => ({ kind, rows: [...map.values()].filter((r) => r.kind === kind) })).filter((g) => g.rows.length)
}

export function RelatedDocumentsPanel({ doc, canManage = false }) {
  const groups = collectRelated(doc)
  const [unlink, setUnlink] = useState(null)
  if (!groups.length) {
    return <EmptyState icon={Link2} title="Sin documentos relacionados" description="Aquí aparecen las órdenes, recepciones y facturas ligadas a este documento." />
  }
  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const Icon = KINDS[group.kind]?.icon ?? Link2
        return (
          <section key={group.kind}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-(--brand-primary-computed)" />{KINDS[group.kind]?.plural ?? group.kind}</h3>
            <ul className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              {group.rows.map((row) => {
                const path = toAppPath(row.path) ?? docPath(group.kind, row.id)
                const canUnlink = canManage && row.relationId && !PROTECTED.has(row.relationType)
                return (
                  <li key={row.id} className="flex items-center">
                    <Link to={path ?? '#'} onClick={(e) => { if (!path) e.preventDefault() }}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--muted))]/40">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold tabular-nums">{row.number ?? row.label ?? row.reference ?? 'Documento'}</span>
                        <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">
                          {row.sublabel ?? row.supplierName ?? (row.issueDate || row.receivedAt ? formatDate(row.issueDate ?? row.receivedAt) : '')}
                        </span>
                      </span>
                      {row.total != null ? <MoneyText value={row.total} currency={row.currency} className="hidden text-sm sm:inline" /> : null}
                      {row.status ? <PurchaseStatusBadge kind={group.kind} status={row.status} /> : null}
                    </Link>
                    {canUnlink ? (
                      <Button variant="ghost" size="icon-sm" className="mr-2" aria-label={`Quitar relación con ${row.number ?? 'el documento'}`} title="Quitar relación"
                        onClick={() => setUnlink({ id: row.relationId, label: row.number ?? row.label })}><Unlink className="h-4 w-4" /></Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      <UnlinkRelationDialog relation={unlink} onOpenChange={(o) => { if (!o) setUnlink(null) }} />
    </div>
  )
}
