import { useState } from 'react'
import { TextField } from '@runly/ui'
import { CODE_LABELS, CODE_MAX, code128Text, codeGeometry } from '../../lib/studio-codes.js'

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
