import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { notesDebug } from '../notesDebug.js'

// ProseMirror finishes its own compositionend handling ~20 ms later; releasing
// held remote updates in the same tick would race it.
const RELEASE_DELAY_MS = 60

export const CompositionGuard = Extension.create({
  name: 'compositionGuard',

  addOptions() {
    return { provider: null }
  },

  addProseMirrorPlugins() {
    const { provider } = this.options
    let releaseTimer = null

    const begin = () => {
      clearTimeout(releaseTimer)
      notesDebug('compositionstart')
      provider?.setComposing(true)
    }
    const end = () => {
      clearTimeout(releaseTimer)
      releaseTimer = setTimeout(() => {
        notesDebug('compositionend (release held updates)')
        provider?.setComposing(false)
      }, RELEASE_DELAY_MS)
    }

    return [
      new Plugin({
        key: new PluginKey('compositionGuard'),
        props: {
          handleDOMEvents: {
            compositionstart: () => { begin(); return false },
            compositionend: () => { end(); return false },
            blur: () => { end(); return false },
          },
        },
        view: () => ({
          destroy: () => {
            clearTimeout(releaseTimer)
            provider?.setComposing(false)
          },
        }),
      }),
    ]
  },
})
