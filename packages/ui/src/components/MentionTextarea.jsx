import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { Bot, Megaphone, Shield } from 'lucide-react'
import { MiraiAvatar } from './MiraiAvatar.jsx'
import { useIsolatedScroll } from '../hooks/useIsolatedScroll.js'
import { layerZIndexFor } from '../hooks/useComboboxPopover.js'
import { ENTITY_TOKEN_SOURCE, PlainEntityChip } from '../lib/entityTokens.jsx'
import { parseSlashContext, slashSourceRows } from '../lib/slashEntitySearch.js'
import { applyEdit, chipName, insideChip, parseSerialized, replaceRange, serializeRanges } from '../lib/mentionRanges.js'

// Stored format:  @[uuid:DisplayName]
// Display format: @[DisplayName]   (no UUID visible in textarea)
// Exported so other chat-rendering code (e.g. the rich-text formatter) can
// split a body into mention/text segments without duplicating this pattern.
export const MENTION_TOKEN_RE = /@\[([a-f0-9-]{36}):([^\]]+)\]/g
const STORED_TOKEN_RE = MENTION_TOKEN_RE

const COMBINED_TOKEN_SOURCE = `${MENTION_TOKEN_RE.source}|${ENTITY_TOKEN_SOURCE}`

export function renderMentionText(text) {
  if (!text) return null
  const parts = []
  let last = 0
  let match
  const re = new RegExp(COMBINED_TOKEN_SOURCE, 'g')
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[3]) {
      parts.push(<PlainEntityChip key={match.index} name={match[5]} />)
    } else {
      parts.push(
        <span
          key={match.index}
          className="inline-flex items-center bg-accent/30 text-accent-foreground rounded px-1 text-sm font-medium"
        >
          @{match[2]}
        </span>
      )
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 0 ? text : parts
}

// Splits raw text into { type: 'text', value } / { type: 'mention', uuid, name }
// segments — the same token this component inserts, but as data instead of
// pre-rendered chips, for callers (the rich-text formatter) that need to
// interleave mentions with their own inline formatting.
export function splitMentionSegments(text) {
  if (!text) return []
  const parts = []
  let last = 0
  let match
  const re = new RegExp(COMBINED_TOKEN_SOURCE, 'g')
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) })
    if (match[3]) parts.push({ type: 'entity', entityType: match[3], recordId: match[4], name: match[5] })
    else parts.push({ type: 'mention', uuid: match[1], name: match[2] })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}

export function parseMentionIds(text) {
  if (!text) return []
  const ids = []
  STORED_TOKEN_RE.lastIndex = 0
  let match
  while ((match = STORED_TOKEN_RE.exec(text)) !== null) {
    ids.push(match[1])
  }
  return [...new Set(ids)]
}

// Non-person entries (assistant, roles, @everyone/@here) get a distinct icon
// badge instead of a letter avatar, so they read as a different kind of
// mention target rather than looking like a real person the query matched.
const KIND_ICON = {
  assistant: Bot,
  role: Shield,
  sentinel: Megaphone,
}

// How many matches the dropdown renders at once — arrow-key navigation is
// clamped to this too (see handleKeyDown). A "+N más" footer below the list
// tells the user there are more instead of silently truncating.
const MENTION_VISIBLE_LIMIT = 8

// Section order in the dropdown; rows keep their incoming order within it.
const KIND_GROUPS = [
  { kind: 'source', label: 'Buscar en un módulo' },
  { kind: 'entity', label: 'Resultados' },
  { kind: 'assistant', label: 'Asistente' },
  { kind: 'person', label: 'Personas' },
  { kind: 'role', label: 'Roles' },
  { kind: 'sentinel', label: 'Avisar a todos' },
]
const kindOf = (m) => (KIND_ICON[m.kind] || m.kind === 'source' || m.kind === 'entity' ? m.kind : 'person')

function MemberAvatar({ member }) {
  const [imgErr, setImgErr] = useState(false)
  if (member.Icon) {
    const Icon = member.Icon
    const color = member.color || 'hsl(var(--muted-foreground))'
    return (
      <span
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 select-none"
        style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
    )
  }
  if (member.kind === 'assistant') return <MiraiAvatar size={28} />
  const Icon = KIND_ICON[member.kind]
  if (Icon) {
    return (
      <span
        className="w-7 h-7 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] flex items-center justify-center shrink-0 select-none"
        style={member.color ? { color: member.color, backgroundColor: `color-mix(in srgb, ${member.color} 16%, transparent)` } : undefined}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
    )
  }
  if (member.avatarUrl && !imgErr) {
    return (
      <img
        src={member.avatarUrl}
        alt=""
        onError={() => setImgErr(true)}
        className="w-7 h-7 rounded-full object-cover shrink-0"
      />
    )
  }
  return (
    <span className="w-7 h-7 rounded-full bg-(--brand-primary) text-(--brand-primary-foreground) flex items-center justify-center text-xs font-semibold shrink-0 select-none">
      {member.displayName.charAt(0).toUpperCase()}
    </span>
  )
}

// Text drawn behind the (transparent) textarea, with each chip styled. Same
// font and wrapping as the field, so the chips land exactly under the text.
function backdropNodes(text, ranges) {
  const out = []
  let pos = 0
  ;[...ranges].sort((a, b) => a.start - b.start).forEach((r, i) => {
    if (r.start > pos) out.push(text.slice(pos, r.start))
    const color = r.color || 'var(--brand-primary)'
    out.push(
      <mark
        key={`${r.start}-${i}`}
        data-chip={i}
        className="rounded-sm text-inherit"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, boxShadow: `inset 0 -2px 0 ${color}`, WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' }}
      >
        {text.slice(r.start, r.end)}
      </mark>
    )
    pos = r.end
  })
  if (pos < text.length) out.push(text.slice(pos))
  return out
}

const BRAND_VARS = ['--brand-primary', '--brand-primary-hover', '--brand-primary-foreground', '--brand-primary-on-dark', '--ring']

// Resolved values of the brand tokens at `el`, to re-apply on a portaled menu.
function inheritedBrandVars(el) {
  if (!el) return null
  const cs = getComputedStyle(el)
  const out = {}
  for (const name of BRAND_VARS) {
    const value = cs.getPropertyValue(name).trim()
    if (value) out[name] = value
  }
  return out
}

// Bold the part of the name that matches what the user typed after "@".
function HighlightMatch({ text, query }) {
  const idx = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-semibold text-(--brand-primary)">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

/**
 * Textarea with @mention support.
 * Props:
 *   value, onChange(newValue) — controlled (serialized @[uuid:name] format)
 *   members — array of { id, displayName } for the mention picker
 *   placeholder, rows, className
 *   disabled
 */
const MentionTextarea = forwardRef(function MentionTextarea({
  value = '',
  onChange,
  onBlur,
  onKeyDown: onKeyDownProp,
  onPaste,
  members = [],
  placeholder,
  rows = 3,
  // Auto-grow cap — `rows` is now just the resting/minimum height, not a
  // fixed size. The field starts at `rows` tall and grows with content up
  // to `maxRows`, then scrolls internally past that.
  maxRows = 6,
  className = '',
  disabled = false,
  portalContainer = null,
  // Optional — fires with { start, end, hasSelection } on every native
  // selectionchange-equivalent event (select/mouseup/keyup) so a caller (e.g.
  // MessageComposer's WhatsApp-style formatting toolbar) can react to a text
  // selection without needing DOM access to the textarea this component owns
  // internally. No consumer passes this today except the chat composer —
  // purely additive, no behavior change for existing callers (CommentThread,
  // RoomChatView, etc.) that omit it.
  onSelectionChange,
  // /module:search shortcuts: [{ key, label, aliases, Icon, color, search(q) -> rows }]
  slashSources = null,
  // Highlight @mentions and #links as chips behind the text.
  chips = false,
  // Chips mode only: pointer over / tap on a chip -> { kind, id, entityType, name, rect } (null on leave).
  onChipHover = null,
  onChipPress = null,
}, ref) {
  // The field holds plain text; mention/link identity lives in `ranges`.
  const [model, setModel] = useState(() => parseSerialized(value))
  const displayValue = model.text
  const ranges = model.ranges
  const lastSerializedRef = useRef(value)

  const commit = useCallback((next) => {
    const serialized = serializeRanges(next.text, next.ranges)
    lastSerializedRef.current = serialized
    setModel({ text: next.text, ranges: next.ranges })
    onChange(serialized)
  }, [onChange])

  useEffect(() => {
    if (value !== lastSerializedRef.current) {
      lastSerializedRef.current = value
      setModel(parseSerialized(value))
    }
  }, [value])

  const [query, setQuery] = useState('')
  const [slash, setSlash] = useState(null)
  const [slashRows, setSlashRows] = useState([])
  const [slashBusy, setSlashBusy] = useState(false)
  const backdropRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [triggerPos, setTriggerPos] = useState(0)
  // The menu is anchored to the textarea (not the caret): it sits just above
  // the field, left-aligned, and — because it's pinned by its bottom edge —
  // grows UPWARD as more results come in. Flips below only if there's no room
  // above (field near the top of the screen).
  const [menuPos, setMenuPos] = useState({ left: 0, width: 240, place: 'above', anchor: 0, maxHeight: 260 })
  const [activeIdx, setActiveIdx] = useState(0)
  const textareaRef = useRef(null)
  const containerRef = useRef(null)
  const menuRef = useRef(null)
  // Portaled mention menu: keep wheel/touch scroll working inside a Dialog/Sheet.
  useIsolatedScroll(menuRef, open)

  // Exposes the internal textarea's imperative API to the parent — needed so
  // callers (e.g. MessageComposer) can refocus after sending, which they
  // otherwise have no way to do since this component owns its own ref.
  useImperativeHandle(ref, () => ({
    focus: (opts) => textareaRef.current?.focus(opts),
    // Writes "/" and opens the slash menu (what the "/ayuda" command shows: every command, selectable).
    openSlashMenu: () => {
      const ta = textareaRef.current
      if (!ta || !slashSources?.length) return
      commit(applyEdit(displayValue, '/', ranges))
      setSlash({ phase: 'source', query: '', start: 0 })
      setQuery('')
      setOpen(true)
      setActiveIdx(0)
      setMenuPos(computeMenuPos(ta))
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(1, 1) })
    },
    blur: () => textareaRef.current?.blur(),
    // Wraps the current selection (or, with nothing selected, just places the
    // cursor between the marks) in the given marker pair — the primitive
    // behind the composer's bold/italic/strikethrough/code keyboard shortcuts.
    // Operates on displayValue directly: a mention chip's `@[Name]` display
    // token has no `*_~` in it, so wrapping around/through one is safe.
    wrapSelection: (markStart, markEnd = markStart) => {
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart ?? displayValue.length
      const end = ta.selectionEnd ?? displayValue.length
      const before = displayValue.slice(0, start)
      const selected = displayValue.slice(start, end)
      const after = displayValue.slice(end)
      const newDisplay = `${before}${markStart}${selected}${markEnd}${after}`
      commit(applyEdit(displayValue, newDisplay, ranges))
      requestAnimationFrame(() => {
        ta.focus()
        const newStart = start + markStart.length
        const newEnd = newStart + selected.length
        ta.setSelectionRange(newStart, newEnd)
      })
    },
    // Line-prefix formatting (bullet/ordered list, blockquote) — a different
    // shape from wrapSelection above: it applies to every line the selection
    // touches (or just the current line, with no selection) rather than
    // wrapping a single inline span. `prefix` is either a constant string
    // ("- ", "> ") or a function(lineIndex) for ordered lists, which need an
    // incrementing "1. ", "2. ", ... per line.
    prefixLines: (prefix) => {
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart ?? displayValue.length
      const end = ta.selectionEnd ?? displayValue.length
      const lineStart = displayValue.lastIndexOf('\n', start - 1) + 1
      const nextBreak = displayValue.indexOf('\n', end)
      const lineEnd = nextBreak === -1 ? displayValue.length : nextBreak
      const before = displayValue.slice(0, lineStart)
      const block = displayValue.slice(lineStart, lineEnd)
      const after = displayValue.slice(lineEnd)
      const lines = block.split('\n')
      const prefixOf = (i) => (typeof prefix === 'function' ? prefix(i) : prefix)
      const prefixedLines = lines.map((line, i) => `${prefixOf(i)}${line}`)
      const newBlock = prefixedLines.join('\n')
      const newDisplay = `${before}${newBlock}${after}`
      commit(applyEdit(displayValue, newDisplay, ranges))
      requestAnimationFrame(() => {
        ta.focus()
        const firstPrefixLen = prefixOf(0).length
        const delta = newBlock.length - block.length
        ta.setSelectionRange(start + firstPrefixLen, end + delta)
      })
    },
  }))

  // Auto-grow: rest at `rows` tall, expand with content up to `maxRows`,
  // then let the field itself scroll past that instead of growing further.
  // Re-measures on every value change (typed, pasted, mention inserted, or
  // set programmatically via the parent) and once on mount for a value that
  // arrives already multi-line (e.g. reopening a draft).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
    const minHeight = lineHeight * rows
    const maxHeight = lineHeight * maxRows
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
    // Chips mode: keep the text layer as narrow as the field when it shows a scrollbar.
    if (backdropRef.current) backdropRef.current.style.right = `${el.offsetWidth - el.clientWidth}px`
  }, [displayValue, rows, maxRows])

  const filtered = slash
    ? (slash.phase === 'source' ? slashSourceRows(slashSources, slash.query, slash.start === 0) : slashRows)
    : query
    ? members.filter((m) => {
        const q = query.toLowerCase()
        return (
          m.displayName.toLowerCase().includes(q) ||
          (m.email && m.email.toLowerCase().includes(q))
        )
      })
    : members

  // What the dropdown shows: grouped by kind, capped at the visible limit.
  // Keyboard navigation indexes into this same array.
  const visible = KIND_GROUPS
    .flatMap(({ kind }) => filtered.filter((m) => kindOf(m) === kind))
    .slice(0, MENTION_VISIBLE_LIMIT)

  // Debounced module search while the user types after "/module:".
  useEffect(() => {
    if (!open || !slash || slash.phase !== 'search') { setSlashRows([]); setSlashBusy(false); return undefined }
    let cancelled = false
    setSlashBusy(true)
    const timer = setTimeout(async () => {
      try {
        const rows = await slash.source.search(slash.query)
        if (!cancelled) setSlashRows((rows ?? []).map((r) => ({ ...r, kind: 'entity', Icon: r.Icon ?? slash.source.Icon, color: r.color ?? slash.source.color })))
      } catch {
        if (!cancelled) setSlashRows([])
      } finally {
        if (!cancelled) setSlashBusy(false)
      }
    }, 220)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [open, slash?.phase, slash?.source, slash?.query]) // eslint-disable-line react-hooks/exhaustive-deps

  // Anchor the menu to the textarea. Default: floating just above it, its
  // bottom pinned so it grows upward with more results. Flip below only when
  // the field is too close to the top of the viewport.
  function computeMenuPos(textarea) {
    const GAP = 6
    const MIN_W = 200
    const MAX_W = 340
    const DESIRED_H = 360
    const rect = textarea.getBoundingClientRect()
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight

    const width = Math.round(Math.min(MAX_W, Math.max(MIN_W, rect.width)))
    const left = Math.round(Math.min(Math.max(8, rect.left), vw - width - 8))

    const spaceAbove = rect.top - GAP - 8
    const spaceBelow = vh - rect.bottom - GAP - 8
    const place = spaceAbove >= 140 || spaceAbove >= spaceBelow ? 'above' : 'below'
    if (place === 'above') {
      return { left, width, place, anchor: Math.round(rect.top - GAP), maxHeight: Math.max(120, Math.min(DESIRED_H, spaceAbove)) }
    }
    return { left, width, place, anchor: Math.round(rect.bottom + GAP), maxHeight: Math.max(120, Math.min(DESIRED_H, spaceBelow)) }
  }

  const handleChange = useCallback(
    (e) => {
      const res = applyEdit(displayValue, e.target.value, ranges)
      commit(res)
      const ta = e.target
      if (res.caret !== null) requestAnimationFrame(() => ta.setSelectionRange(res.caret, res.caret))

      const caret = res.caret ?? ta.selectionStart
      const before = res.text.slice(0, caret)
      const slashCtx = slashSources?.length ? parseSlashContext(before, slashSources) : null
      if (slashCtx && !insideChip(res.ranges, slashCtx.start)) {
        setSlash(slashCtx)
        setQuery(slashCtx.query)
        setOpen(true)
        setActiveIdx(0)
        setMenuPos(computeMenuPos(ta))
        return
      }
      setSlash(null)
      const atMatch = before.match(/@([^\s@]*)$/)
      const atIdx = atMatch ? before.length - atMatch[0].length : -1
      if (atMatch && !insideChip(res.ranges, atIdx) && (atIdx === 0 || /\s/.test(before[atIdx - 1]))) {
        setTriggerPos(atIdx)
        setQuery(atMatch[1])
        setOpen(true)
        setActiveIdx(0)
        setMenuPos(computeMenuPos(ta))
      } else {
        setOpen(false)
      }
    },
    [displayValue, ranges, commit, slashSources]
  )

  const insertMention = useCallback(
    (member) => {
      const ta = textareaRef.current
      if (!ta) return
      const caret = ta.selectionStart
      if (slash && member.kind === 'source') {
        // Module picked: keep the dropdown open on its search results.
        const src = member.source
        if (src.command) {
          // A command: write it with a trailing space for its arguments and close the menu.
          const text = `/${src.aliases[0]} `
          commit(replaceRange(displayValue, ranges, slash.start, caret, text))
          setSlash(null)
          setOpen(false)
          requestAnimationFrame(() => { const pos = slash.start + text.length; ta.setSelectionRange(pos, pos); ta.focus() })
          return
        }
        const typed = `/${src.aliases[0]}:`
        commit(replaceRange(displayValue, ranges, slash.start, caret, typed))
        setSlash({ phase: 'search', source: src, query: '', start: slash.start })
        setQuery('')
        setActiveIdx(0)
        requestAnimationFrame(() => {
          const pos = slash.start + typed.length
          ta.setSelectionRange(pos, pos)
          ta.focus()
        })
        return
      }
      const start = slash ? slash.start : triggerPos
      const name = chipName(member.displayName)
      const isEntity = member.kind === 'entity'
      const shown = isEntity ? name : `@${name}`
      const chip = isEntity
        ? { kind: 'entity', entityType: member.entity.entityType, id: member.entity.recordId, color: member.color }
        : { kind: 'user', id: member.id, color: member.color }
      // The chip covers the name only; the trailing space is ordinary text.
      const next = replaceRange(displayValue, ranges, start, caret, `${shown} `, chip)
      commit({
        text: next.text,
        ranges: next.ranges.map((r) => (r.start === start && r.kind === chip.kind ? { ...r, end: start + shown.length } : r)),
      })
      setSlash(null)
      setOpen(false)
      setQuery('')
      requestAnimationFrame(() => {
        const newCaret = start + shown.length + 1
        ta.setSelectionRange(newCaret, newCaret)
        ta.focus()
      })
    },
    [displayValue, ranges, triggerPos, commit, slash]
  )

  // The backdrop sits under the textarea (which owns the pointer), so chips
  // are hit-tested by their rendered rectangles.
  const lastChipRef = useRef(null)
  function chipAt(x, y) {
    const marks = backdropRef.current?.querySelectorAll('[data-chip]')
    if (!marks) return null
    const sorted = [...ranges].sort((a, b) => a.start - b.start)
    for (const el of marks) {
      for (const rect of el.getClientRects()) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          const r = sorted[Number(el.dataset.chip)]
          if (!r) return null
          return { kind: r.kind, id: r.id, entityType: r.entityType, name: displayValue.slice(r.start, r.end).replace(/^@/, ''), start: r.start, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }
        }
      }
    }
    return null
  }
  function handleChipMove(e) {
    const hit = chipAt(e.clientX, e.clientY)
    const key = hit ? hit.start : null
    if (key === lastChipRef.current) return
    lastChipRef.current = key
    onChipHover(hit)
  }
  function handleChipLeave() {
    if (lastChipRef.current === null) return
    lastChipRef.current = null
    onChipHover(null)
  }
  function handleChipClick(e) {
    const hit = chipAt(e.clientX, e.clientY)
    if (hit) onChipPress(hit)
  }

  function handleKeyDown(e) {
    if (open) {
      // Clamp navigation to the visible slice — filtered can hold more
      // results than are rendered (see MENTION_VISIBLE_LIMIT below), and
      // arrowing onto a hidden one would leave nothing highlighted.
      const visibleCount = visible.length
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, visibleCount - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (visible[activeIdx]) {
          e.preventDefault()
          insertMention(visible[activeIdx])
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    } else {
      onKeyDownProp?.(e)
    }
  }

  // Arrow-key navigation: keep the highlighted option in view.
  useEffect(() => {
    if (!open) return
    // The row's wrapper also holds its section title, so the first row of a
    // group brings its header along when scrolling up.
    const row = menuRef.current?.querySelector('[aria-selected="true"]')
    ;(row?.closest('[role="presentation"]') ?? row)?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  // Keep the menu glued to the textarea while it's open: re-anchor when the
  // result count changes (width/flip can change) and on scroll/resize.
  useEffect(() => {
    if (!open) return
    const reanchor = () => {
      if (textareaRef.current) setMenuPos(computeMenuPos(textareaRef.current))
    }
    reanchor()
    window.addEventListener('scroll', reanchor, true)
    window.addEventListener('resize', reanchor)
    return () => {
      window.removeEventListener('scroll', reanchor, true)
      window.removeEventListener('resize', reanchor)
    }
  }, [open, filtered.length])

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        !e.target?.closest?.('[data-mention-dropdown]')
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClick)
    return () => document.removeEventListener('pointerdown', handleClick)
  }, [open])

  // No native 'onselectionchange' React prop exists — 'select' only fires on
  // an actual selection made via mouse/keyboard, not every caret move, but
  // that's exactly what a formatting toolbar needs to know about anyway.
  // mouseup/keyup cover drag-to-select and shift+arrow selection, which
  // 'select' alone can miss in some browsers.
  const handleSelectionEvent = useCallback(() => {
    if (!onSelectionChange) return
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart ?? 0
    const end = ta.selectionEnd ?? 0
    onSelectionChange({ start, end, hasSelection: end > start })
  }, [onSelectionChange])

  const idRef = useRef(`mention-ta-${Math.random().toString(36).slice(2)}`)

  return (
    <div ref={containerRef} className={`relative w-full min-w-0 max-w-full overflow-x-hidden`}>
      {chips && (
        <div
          ref={backdropRef}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-sm [overflow-wrap:anywhere] ${className}`}
        >
          {backdropNodes(displayValue, ranges)}
          {'\n'}
        </div>
      )}
      <textarea
        ref={textareaRef}
        id={idRef.current}
        name={idRef.current}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onBlur={onBlur}
        onSelect={handleSelectionEvent}
        onMouseMove={chips && onChipHover ? handleChipMove : undefined}
        onMouseLeave={chips && onChipHover ? handleChipLeave : undefined}
        onClick={chips && onChipPress ? handleChipClick : undefined}
        onScroll={chips ? (e) => { if (backdropRef.current) backdropRef.current.scrollTop = e.target.scrollTop } : undefined}
        onMouseUp={handleSelectionEvent}
        onKeyUp={handleSelectionEvent}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={`w-full min-w-0 max-w-full overflow-x-hidden rounded-md border border-input ${chips ? 'relative bg-transparent text-transparent caret-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]' : 'bg-background'} px-3 py-2 text-sm resize-none [overflow-wrap:anywhere] focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 ${className}`}
      />
      {open && (filtered.length > 0 || (slash && slash.phase === 'search')) && createPortal(
        <div
          ref={menuRef}
          data-mention-dropdown
          role="listbox"
          aria-label="Mencionar"
          className="glass-floating rounded-xl py-1.5 overflow-y-auto overscroll-contain flex flex-col scroll-pt-1 [@media(pointer:fine)]:scroll-pb-9"
          style={{
            position: 'fixed',
            left: menuPos.left,
            width: menuPos.width,
            // Pinned by bottom when above the field -> grows upward with results.
            ...(menuPos.place === 'above'
              ? { bottom: Math.max(8, (window.visualViewport?.height ?? window.innerHeight) - menuPos.anchor) }
              : { top: menuPos.anchor }),
            zIndex: layerZIndexFor(containerRef.current),
            maxHeight: menuPos.maxHeight,
            // Portaled outside any themed ancestor: carry the accent over.
            ...inheritedBrandVars(containerRef.current),
          }}
        >
          {visible.map((m, i) => {
            const groupStart = i === 0 || kindOf(visible[i - 1]) !== kindOf(m) || Boolean(visible[i - 1].source?.command) !== Boolean(m.source?.command)
            const group = KIND_GROUPS.find((g) => g.kind === kindOf(m))
            const active = i === activeIdx
            return (
              <div key={m.id} role="presentation">
                {groupStart && (
                  <p className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${i === 0 ? 'pt-1' : 'pt-2.5'}`}>
                    {kindOf(m) === 'entity' && slash?.source ? `Resultados en ${slash.source.label}` : m.source?.command ? 'Comandos' : group?.label}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`mx-1 flex min-h-11 w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors md:min-h-10 ${
                    active ? 'bg-(--brand-primary)/12 text-foreground' : 'text-foreground hover:bg-[hsl(var(--muted))]/70'
                  }`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    insertMention(m)
                  }}
                >
                  <MemberAvatar member={m} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-tight">
                      {m.kind === 'sentinel' || m.kind === 'role' ? '@' : ''}
                      <HighlightMatch text={m.displayName} query={query} />
                    </span>
                    {m.description && (
                      <span className="block truncate text-xs leading-tight text-muted-foreground">{m.description}</span>
                    )}
                  </span>
                </button>
              </div>
            )
          })}
          {slash?.phase === 'search' && visible.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">{slashBusy ? 'Buscando…' : `Sin resultados en ${slash.source.label}`}</p>
          )}
          {filtered.length > MENTION_VISIBLE_LIMIT && (
            <span className="px-3 py-1 text-xs text-muted-foreground border-t border-(--glass-border) mt-1 pt-1.5">
              +{filtered.length - MENTION_VISIBLE_LIMIT} más — sigue escribiendo para filtrar
            </span>
          )}
          <p className="sticky -bottom-1.5 mt-1 hidden border-t border-(--glass-border) bg-white/80 dark:bg-slate-800/85 px-3 pt-1.5 pb-1 text-[11px] text-muted-foreground backdrop-blur [@media(pointer:fine)]:block">
            ↑↓ moverte · Enter elegir · Esc cerrar
          </p>
        </div>,
        portalContainer ?? document.body
      )}
    </div>
  )
})

export default MentionTextarea
