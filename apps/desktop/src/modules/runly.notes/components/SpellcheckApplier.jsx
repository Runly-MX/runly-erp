import { useEffect } from 'react'
import { useCurrentEditor } from '@tiptap/react'
import { useNoteSpellcheck } from '../hooks/useNoteSpellcheck.js'

// Applies the per-note spellcheck preference to the editor DOM. Done in an
// effect (not through editorProps) so toggling never rebuilds the editor.
export function SpellcheckApplier({ noteId }) {
  const { editor } = useCurrentEditor()
  const [enabled] = useNoteSpellcheck(noteId)
  useEffect(() => {
    const dom = editor?.view?.dom
    if (!dom) return
    dom.setAttribute('spellcheck', String(enabled))
    dom.setAttribute('autocorrect', enabled ? 'on' : 'off')
  }, [editor, enabled])
  return null
}
