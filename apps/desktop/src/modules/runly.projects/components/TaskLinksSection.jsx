import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link2, Plus, X } from 'lucide-react'
import { Button, Input, SelectField } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'
import { useAddTaskLink, useRemoveTaskLink, useTaskLinks } from '../hooks/useProjectsData'

const TYPE_OPTIONS = [
  { value: 'contact', label: 'Contacto' },
  { value: 'hr_employee', label: 'Colaborador' },
  { value: 'vehicle', label: 'Vehículo' },
  { value: 'inventory_item', label: 'Artículo de inventario' },
  { value: 'calendar_event', label: 'Evento de calendario' },
  { value: 'ledger_account', label: 'Cuenta' },
  { value: 'file', label: 'Archivo' },
]
const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]))

// "Vinculado a" block of the task detail: records of other modules the task is about.
export function TaskLinksSection({ projectId, taskId, canEdit = true }) {
  const { session } = useAuth()
  const token = session?.access_token
  const { data: links = [] } = useTaskLinks(projectId, taskId)
  const addLink = useAddTaskLink(projectId, taskId)
  const removeLink = useRemoveTaskLink(projectId, taskId)
  const [adding, setAdding] = useState(false)
  const [type, setType] = useState('contact')
  const [search, setSearch] = useState('')

  const results = useQuery({
    queryKey: ['relation-targets', type, search],
    queryFn: () => runly.relationTargets.search(type, search, token),
    enabled: adding && Boolean(token),
    staleTime: 30 * 1000,
  })
  const linked = new Set(links.map((l) => `${l.targetType}:${l.targetId}`))

  function pick(record) {
    addLink.mutate({ targetType: type, targetId: record.id }, {
      onSuccess: () => { setAdding(false); setSearch('') },
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vinculado a</span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((o) => !o)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Vincular
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-2 space-y-2 rounded-md border border-[hsl(var(--border))] p-2">
          <SelectField options={TYPE_OPTIONS} value={type} onValueChange={setType} aria-label="Tipo de registro" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar registro..." />
          <ul className="max-h-40 overflow-y-auto">
            {(results.data?.data ?? []).filter((r) => !linked.has(`${type}:${r.id}`)).map((record) => (
              <li key={record.id}>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => pick(record)}>
                  <span className="truncate">{record.title}</span>
                  {record.subtitle && <span className="ml-2 truncate text-xs text-muted-foreground">{record.subtitle}</span>}
                </Button>
              </li>
            ))}
            {!results.isLoading && (results.data?.data ?? []).length === 0 && (
              <li className="px-2 py-1 text-xs text-muted-foreground">Sin resultados.</li>
            )}
          </ul>
        </div>
      )}

      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin registros vinculados.</p>
      ) : (
        <ul className="space-y-1">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-2 rounded-md bg-[hsl(var(--muted))] px-2 py-1 text-sm">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{link.label || 'Registro no disponible'}</span>
              <span className="text-xs text-muted-foreground">{TYPE_LABEL[link.targetType] ?? link.targetType}</span>
              {canEdit && (
                <button type="button" aria-label="Quitar vinculo" onClick={() => removeLink.mutate(link.id)}>
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
