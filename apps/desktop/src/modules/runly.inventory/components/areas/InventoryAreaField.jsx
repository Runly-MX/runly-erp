import { useEffect } from 'react'
import { ComboboxField } from '@runly/ui'
import { FolderTree } from 'lucide-react'
import { useAreaChoices } from '../../hooks/useAreaChoices.js'
import { AREA_NONE } from '../../lib/area-tree.js'

// "Área" picker of the item form. Areas are managed on their own screen, so nothing is created here.
// Hidden when the company has no areas and the user is not forced to pick one.
export function InventoryAreaField({ value, onChange, error, disabled, isEdit = false }) {
  const { writeOptions, requireArea, areas, isLoading } = useAreaChoices()
  const current = value || ''

  // A limited user with exactly one writable area gets it preselected on a new item.
  useEffect(() => {
    if (isEdit || isLoading || current || !requireArea || writeOptions.length !== 1) return
    onChange(writeOptions[0].value)
  }, [isEdit, isLoading, current, requireArea, writeOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || (!requireArea && areas.length === 0)) return null
  const shown = current || (requireArea ? '' : AREA_NONE)

  return (
    <ComboboxField
      label="Área"
      icon={FolderTree}
      required={requireArea}
      disabled={disabled}
      value={shown}
      options={writeOptions}
      error={error}
      hint={requireArea ? 'Elige el área donde se registra el item.' : 'Carpeta del inventario. Sin área, el item queda en General.'}
      onChange={(next) => onChange(next === AREA_NONE ? null : next)}
      placeholder="Elegir área..."
    />
  )
}
