// Registry key: runly.inventory:CustomFieldsSection — the item's custom field
// values (its type's fields and the ones added to this item only).
import { useNavigate } from 'react-router-dom'
import { FilterByValueButton, isNewTabClick, openInNewTab } from '@runly/ui'
import { filledCustomValues } from '../lib/custom-values.js'
import { customFieldFilterUrl } from '../lib/custom-field-filter.js'

const YES_NO = { true: 'Sí', false: 'No' }

function formatValue(field, value) {
  if (field?.fieldType === 'boolean') return YES_NO[String(value)] ?? value
  if (field?.fieldType === 'date' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = String(value).slice(0, 10).split('-')
    return `${d}/${m}/${y}`
  }
  return value
}

export default function InventoryDetailCustomFieldsSection({ data }) {
  const navigate = useNavigate()
  const entries = filledCustomValues(data?.customValues)
  if (!entries.length) return null
  return (
    <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {entries.map((cv) => {
        const value = formatValue(cv.field, cv.value)
        const isLink = cv.field.fieldType === 'url'
        const filterable = cv.field.fieldType !== 'textarea' && !isLink
        return (
          <div key={cv.fieldId ?? cv.field.id} className={cv.field.fieldType === 'textarea' ? 'min-w-0 col-span-full space-y-1.5' : 'min-w-0 space-y-1.5'}>
            <dt className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              {cv.field.label}
              {cv.field.onDemand ? <span className="ml-1.5 normal-case tracking-normal text-[10px] text-[hsl(var(--muted-foreground))]">(de este activo)</span> : null}
            </dt>
            <dd className="flex items-start gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {isLink ? <a href={value} target="_blank" rel="noreferrer" className="text-(--brand-primary) hover:underline">{value}</a> : value}
              </span>
              {filterable ? (
                <FilterByValueButton
                  className="ml-auto"
                  label={cv.field.label}
                  value={value}
                  onClick={(event) => {
                    const url = customFieldFilterUrl(cv.field, cv.value)
                    if (isNewTabClick(event)) openInNewTab(url)
                    else navigate(url)
                  }}
                />
              ) : null}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
