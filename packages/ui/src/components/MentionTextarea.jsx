import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { Bot, Megaphone, Shield } from 'lucide-react'
import { MiraiAvatar } from './MiraiAvatar.jsx'
import { useIsolatedScroll } from '../hooks/useIsolatedScroll.js'
import { layerZIndexFor } from '../hooks/useComboboxPopover.js'

// Stored format:  @[uuid:DisplayName]
// Display format: @[DisplayName]   (no UUID visible in textarea)
// Exported so other chat-rendering code (e.g. the rich-text formatter) can
// split a body into mention/text segments without duplicating this pattern.
export const MENTION_TOKEN_RE = /@\[([a-f0-9-]{36}):([^\]]+)\]/g
const STORED_TOKEN_RE = MENTION_TOKEN_RE
const DISPLAY_TOKEN_RE = /@\[([^\]]+)\]/g

export function renderMentionText(text) {
  if (!text) return null
  const parts = []
  let last = 0
  let match
  STORED_TOKEN_RE.lastIndex = 0
  while ((match = STORED_TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(
      <span
        key={match.index}
        className="inline-flex items-center bg-accent/30 text-accent-foreground rounded px-1 text-sm font-medium"
      >
        @{match[2]}
      </span>
    )
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
  MENTION_TOKEN_RE.lastIndex = 0
  while ((match = MENTION_TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) })
    parts.push({ type: 'mention', uuid: match[1], name: match[2] })
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

function toDisplay(serialized, mentionMap) {
  if (!serialized) return ''
  STORED_TOKEN_RE.lastIndex = 0
  return serialized.replace(STORED_TOKEN_RE, (_, uuid, name) => {
    mentionMap.set(name, uuid)
    return `@[${name}]`
  })
}

function toSerialized(display, mentionMap) {
  if (!display) return ''
  DISPLAY_TOKEN_RE.lastIndex = 0
  return display.replace(DISPLAY_TOKEN_RE, (match, name) => {
    const uuid = mentionMap.get(name)
    return uuid ? `@[${uuid}:${name}]` : match
  })
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
  { kind: 'assistant', label: 'Asistente' },
  { kind: 'person', label: 'Personas' },
  { kind: 'role', label: 'Roles' },
  { kind: 'sentinel', label: 'Avisar a todos' },
]
const kindOf = (m) => (KIND_ICON[m.kind] ? m.kind : 'person')

function MemberAvatar({ member }) {
  const [imgErr, setImgErr] = useState(false)
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
}, ref) {
  const mentionMap = useRef(new Map())
  const [displayValue, setDisplayValue] = useState(() => toDisplay(value, mentionMap.current))
  const lastSerializedRef = useRef(value)

  useEffect(() => {
    if (value !== lastSerializedRef.current) {
      lastSerializedRef.current = value
      const newDisplay = toDisplay(value, mentionMap.current)
      setDisplayValue(newDisplay)
    }
  }, [value])

  const [query, setQuery] = useState('')
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
      setDisplayValue(newDisplay)
      const serialized = toSerialized(newDisplay, mentionMap.current)
      lastSerializedRef.current = serialized
      onChange(serialized)
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
      setDisplayValue(newDisplay)
      const serialized = toSerialized(newDisplay, mentionMap.current)
      lastSerializedRef.current = serialized
      onChange(serialized)
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
  }, [displayValue, rows, maxRows])

  const filtered = query
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
      const newDisplay = e.target.value
      setDisplayValue(newDisplay)
      const serialized = toSerialized(newDisplay, mentionMap.current)
      lastSerializedRef.current = serialized
      onChange(serialized)

      const caret = e.target.selectionStart
      const before = newDisplay.slice(0, caret)
      const atMatch = before.match(/@([^\s@\[]*)$/)
      if (atMatch && !before.match(/@\[[^\]]*$/)) {
        const atIdx = before.lastIndexOf('@')
        setTriggerPos(atIdx)
        setQuery(atMatch[1])
        setOpen(true)
        setActiveIdx(0)
        setMenuPos(computeMenuPos(e.target))
      } else {
        setOpen(false)
      }
    },
    [onChange]
  )

  const insertMention = useCallback(
    (member) => {
      const ta = textareaRef.current
      if (!ta) return
      const caret = ta.selectionStart
      const before = displayValue.slice(0, triggerPos)
      const after = displayValue.slice(caret)
      mentionMap.current.set(member.displayName, member.id)
      const token = `@[${member.displayName}]`
      const newDisplay = `${before}${token} ${after}`
      setDisplayValue(newDisplay)
      const serialized = toSerialized(newDisplay, mentionMap.current)
      lastSerializedRef.current = serialized
      onChange(serialized)
      setOpen(false)
      setQuery('')
      requestAnimationFrame(() => {
        const newCaret = before.length + token.length + 1
        ta.setSelectionRange(newCaret, newCaret)
        ta.focus()
      })
    },
    [displayValue, triggerPos, onChange]
  )

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
    <div ref={containerRef} className="relative w-full min-w-0 max-w-full overflow-x-hidden">
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
        onMouseUp={handleSelectionEvent}
        onKeyUp={handleSelectionEvent}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={`w-full min-w-0 max-w-full overflow-x-hidden rounded-md border border-input bg-background px-3 py-2 text-sm resize-none [overflow-wrap:anywhere] focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 ${className}`}
      />
      {open && filtered.length > 0 && createPortal(
        <div
          ref={menuRef}
          data-mention-dropdown
          role="listbox"
          aria-label="Mencionar"
          className="rounded-xl py-1.5 overflow-y-auto overscroll-contain flex flex-col scroll-pt-1 [@media(pointer:fine)]:scroll-pb-9"
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
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            background: 'var(--glass-bg-strong)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--glass-shadow)',
          }}
        >
          {visible.map((m, i) => {
            const groupStart = i === 0 || kindOf(visible[i - 1]) !== kindOf(m)
            const group = KIND_GROUPS.find((g) => g.kind === kindOf(m))
            const active = i === activeIdx
            return (
              <div key={m.id} role="presentation">
                {groupStart && (
                  <p className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${i === 0 ? 'pt-1' : 'pt-2.5'}`}>
                    {group?.label}
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
          {filtered.length > MENTION_VISIBLE_LIMIT && (
            <span className="px-3 py-1 text-xs text-muted-foreground border-t border-(--glass-border) mt-1 pt-1.5">
              +{filtered.length - MENTION_VISIBLE_LIMIT} más — sigue escribiendo para filtrar
            </span>
          )}
          <p className="sticky -bottom-1.5 mt-1 hidden border-t border-(--glass-border) bg-(--glass-bg-strong) px-3 pt-1.5 pb-1 text-[11px] text-muted-foreground backdrop-blur [@media(pointer:fine)]:block">
            ↑↓ moverte · Enter elegir · Esc cerrar
          </p>
        </div>,
        portalContainer ?? document.body
      )}
    </div>
  )
})

export default MentionTextarea
