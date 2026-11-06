import { useState } from 'react'
import { TextField } from '@runly/ui'
import { CODE_LABELS, CODE_MAX, code128Text, codeGeometry } from '../../lib/studio-codes.js'

// Bulk create: the row's photo (a "Foto" column from Inventario, Flota, RH or
// Contactos) replaces this image; the design keeps it as the placeholder.
export function ImageFieldControl({ selection, disabled, onPatch }) {
  const [draft, setDraft] = useState(selection.imageField ?? '')
  const apply = () => { const value = draft.replace(/[{}]/g, '').trim(); if (value !== (selection.imageField ?? '')) onPatch({ imageField: value }) }
  return (
    <TextField id={`studio-image-field-${selection.id}`} label="Campo de foto" value={draft} maxLength={60} disabled={disabled} placeholder="Foto"
      onChange={event => setDraft(event.target.value)} onBlur={apply} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply() } }}
      hint="Escribe el nombre de la columna (por ejemplo Foto) para que cada versión use la foto de su registro. Vacío: la imagen no cambia." />
  )
}

// Content of a QR / barcode. Applied on blur or Enter so typing does not push
// one sync operation per keystroke; the geometry is regenerated from the value.
export function CodeContentField({ selection, disabled, onPatch }) {
  const { kind, value } = selection.code
  const [draft, setDraft] = useState(value), [error, setError] = useState(null)
  function apply() {
    if (draft === value) return
    try { onPatch({ code: { kind, value: draft }, geometry: codeGeometry(kind, draft) }); setError(null) }
    catch (failure) { setError(failure.message) }
  }
  const replaced = kind === 'code128' && code128Text(draft) !== draft
  return (
    <div className="space-y-1.5">
      <TextField id={`studio-code-${selection.id}`} label={`Contenido del ${CODE_LABELS[kind].toLowerCase()}`} value={draft} maxLength={CODE_MAX[kind]} disabled={disabled}
        onChange={event => setDraft(event.target.value)} onBlur={apply} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply() } }}
        error={error ?? undefined} hint={replaced ? 'El código de barras solo admite letras sin acento, números y símbolos básicos; lo demás se imprime como «?».' : 'Texto, enlace o un campo como {{Número de activo}} para crear en lote.'} />
    </div>
  )
}
