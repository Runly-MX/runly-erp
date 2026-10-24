import { useEffect, useState } from 'react'
import { extractOutline } from '../lib/outline.js'

// Live outline (real headings only) plus the heading currently being read.
// Scroll spy: the last heading whose top is at or above 25% of the scroll
// container's height. The container is the nearest [data-note-scroll]; when
// the page owns the scroll (public view) the window/viewport is used.
export function useOutline(editor) {
  const [items, setItems] = useState([])
  const [activeId, setActiveId] = useState(null)

  useEffect(() => {
    if (!editor) return undefined
    let timer = null
    const refresh = () => setItems(extractOutline(editor.state.doc))
    const onUpdate = () => {
      clearTimeout(timer)
      timer = setTimeout(refresh, 200)
    }
    refresh()
    editor.on('update', onUpdate)
    return () => {
      clearTimeout(timer)
      editor.off('update', onUpdate)
    }
  }, [editor])

  useEffect(() => {
    if (!editor?.view || items.length === 0) {
      setActiveId(null)
      return undefined
    }
    const scroller = editor.view.dom.closest('[data-note-scroll]')
    const target = scroller ?? window
    let raf = 0

    function compute() {
      raf = 0
      const rect = scroller
        ? scroller.getBoundingClientRect()
        : { top: 0, height: window.innerHeight }
      const threshold = rect.top + rect.height * 0.25
      let current = null
      for (const item of items) {
        const dom = editor.view.nodeDOM(item.pos)
        if (!dom?.getBoundingClientRect) continue
        if (dom.getBoundingClientRect().top <= threshold) current = item.id
        else break
      }
      setActiveId(current)
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(compute)
    }

    compute()
    target.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      target.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [editor, items])

  return { items, activeId }
}
