import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Pin, PinOff, ChevronLeft, ChevronDown, Eye, Pencil, Search, Plus } from 'lucide-react'

const BAR_H      = 46
const STORAGE_KEY = 'runly-editor-bar-pinned'
const STYLES_ID   = 'runly-editor-bar-css'

const CSS = `
@keyframes _runlyPulse {
  0%,100% { opacity:1 }
  50%      { opacity:0.3 }
}
._runlyCornerLine { animation: _runlyPulse 2.4s ease-in-out infinite }
`

function injectCss() {
  if (document.getElementById(STYLES_ID)) return
  const s = document.createElement('style')
  s.id = STYLES_ID
  s.textContent = CSS
  document.head.appendChild(s)
}

// ── Page picker combobox ─────────────────────────────────────────────────────

function PageCombobox({ pages = [], currentPage, onNavigate, onCreatePage }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const triggerRef          = useRef(null)
  const dropdownRef         = useRef(null)
  const inputRef            = useRef(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    function onDown(e) {
      // close only when clicking outside both the trigger AND the portal dropdown
      if (
        !triggerRef.current?.contains(e.target) &&
        !dropdownRef.current?.contains(e.target)
      ) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const q        = search.trim().toLowerCase()
  const filtered = q
    ? pages.filter((p) => p.title.toLowerCase().includes(q) || p.routePath.toLowerCase().includes(q))
    : pages

  const canCreate = q && !filtered.find((p) => p.title.toLowerCase() === q)

  const rect = open && triggerRef.current ? triggerRef.current.getBoundingClientRect() : null

  return (
    <>
      <button type="button"
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: open ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${open ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.22)'}`,
          color: '#c4b5fd',
          borderRadius: 7, padding: '4px 10px',
          fontSize: 12, fontWeight: 600,
          cursor: 'pointer',
          maxWidth: 200,
          transition: 'all 120ms',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
          {currentPage?.title || 'Paginas'}
        </span>
        <ChevronDown
          size={11}
          style={{ flexShrink: 0, color: '#6366f1', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        />
      </button>

      {open && rect && createPortal(
        <div ref={dropdownRef} style={{
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          minWidth: 240, maxWidth: 300,
          background: '#12103a',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 999999,
          overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '5px 9px' }}>
              <Search size={11} style={{ color: '#6b7280', flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar o crear..."
                style={{ background: 'none', border: 'none', outline: 'none', color: '#e5e7eb', fontSize: 12, width: '100%' }}
              />
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 && !canCreate && (
              <p style={{ textAlign: 'center', padding: '10px 0', color: '#6b7280', fontSize: 12 }}>Sin resultados</p>
            )}
            {filtered.map((p) => (
              <button type="button"
                key={p.id}
                onClick={() => { onNavigate?.(p.routePath); setOpen(false); setSearch('') }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '7px 10px',
                  background: p.id === currentPage?.id ? 'rgba(99,102,241,0.2)' : 'transparent',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  transition: 'background 100ms',
                  gap: 8,
                }}
                onMouseEnter={(e) => { if (p.id !== currentPage?.id) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={(e) => { if (p.id !== currentPage?.id) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ color: '#e5e7eb', fontSize: 12, fontWeight: p.id === currentPage?.id ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title}
                </span>
                <span style={{ color: '#4b5563', fontSize: 10, fontFamily: 'monospace', flexShrink: 0 }}>{p.routePath}</span>
              </button>
            ))}

            {canCreate && (
              <button type="button"
                onClick={() => { onCreatePage?.(search.trim()); setOpen(false); setSearch('') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  width: '100%', padding: '7px 10px',
                  background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer',
                  borderTop: filtered.length ? '1px solid rgba(255,255,255,0.07)' : 'none',
                  marginTop: filtered.length ? 4 : 0,
                  transition: 'background 100ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <Plus size={12} style={{ color: '#6366f1', flexShrink: 0 }} />
                <span style={{ color: '#a78bfa', fontSize: 12 }}>
                  Crear <strong style={{ color: '#c4b5fd' }}>"{search.trim()}"</strong>
                </span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// ── Main bar ─────────────────────────────────────────────────────────────────

export const BAR_H_PX = BAR_H

export function EditorContextBar({
  site,
  page,
  pages = [],
  editMode = false,
  onToggleEdit,
  onNavigate,
  onPublishPage,
  onUnpublishPage,
  onCreatePage,
  onPinChange,
  isPublishing = false,
}) {
  const navigate = useNavigate()
  const [pinned, setPinned]   = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')
  const [visible, setVisible] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')
  const hideTimer             = useRef(null)

  useEffect(() => {
    injectCss()
    return () => clearTimeout(hideTimer.current)
  }, [])

  const barOpen = visible || pinned

  function togglePin() {
    const next = !pinned
    setPinned(next)
    localStorage.setItem(STORAGE_KEY, String(next))
    setVisible(next)
    onPinChange?.(next)
  }

  function show() {
    clearTimeout(hideTimer.current)
    setVisible(true)
  }

  function scheduleHide() {
    if (pinned) return
    hideTimer.current = setTimeout(() => setVisible(false), 350)
  }

  const isPublished = page?.status === 'published'

  const divider = (
    <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
  )

  return (
    <>
      {/* ── Bar — position:fixed, transform slides it in/out ─────────── */}
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100%',
          height: BAR_H,
          zIndex: 9998,
          transform: barOpen ? 'translateY(0)' : 'translateY(-100%)',
          transition: 'transform 170ms ease',
          // bar itself is interactive; corner trigger takes over when hidden
        }}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      >
        <div style={{
          position: 'relative',
          height: BAR_H,
          display: 'flex', alignItems: 'center',
          gap: 4, paddingLeft: 8, paddingRight: 12,
          background: 'linear-gradient(180deg, #0c0a1e 0%, #0f0d28 100%)',
          borderBottom: '1px solid rgba(99,102,241,0.2)',
          backdropFilter: 'blur(14px)',
        }}>
          {/* Top accent gradient */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 35%, #a78bfa 50%, #8b5cf6 65%, #6366f1 100%)',
            opacity: 0.75,
          }} />

          {/* Pin */}
          <button type="button"
            onClick={togglePin}
            title={pinned ? 'Desfijar barra' : 'Fijar barra'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, flexShrink: 0,
              background: 'none', border: 'none', cursor: 'pointer', borderRadius: 5,
              color: pinned ? '#a78bfa' : '#4b5563',
              transition: 'color 150ms, background 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = pinned ? '#c4b5fd' : '#6b7280' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = pinned ? '#a78bfa' : '#4b5563' }}
          >
            {pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>

          {divider}

          {/* Back to ERP */}
          <button type="button"
            onClick={() => navigate('/app')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6b7280', fontSize: 12, borderRadius: 5, padding: '3px 7px',
              transition: 'color 150ms, background 150ms',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'none' }}
          >
            <ChevronLeft size={13} />
            Runly ERP
          </button>

          {divider}

          {/* Page combobox */}
          <PageCombobox
            pages={pages}
            currentPage={page}
            onNavigate={onNavigate}
            onCreatePage={onCreatePage}
          />

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Vista / Editor toggle */}
          <div style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: 2, gap: 1,
            flexShrink: 0,
          }}>
            {[
              { label: 'Vista',  icon: <Eye    size={11} />, active: !editMode, onClick: () => editMode  && onToggleEdit?.() },
              { label: 'Editor', icon: <Pencil size={11} />, active:  editMode, onClick: () => !editMode && onToggleEdit?.() },
            ].map(({ label, icon, active, onClick }) => (
              <button type="button"
                key={label}
                onClick={onClick}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 6,
                  fontSize: 11, fontWeight: 600,
                  color: active ? '#fff' : '#4b5563',
                  background: active ? 'rgba(99,102,241,0.75)' : 'transparent',
                  border: 'none', cursor: active ? 'default' : 'pointer',
                  transition: 'all 120ms',
                }}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {divider}

          {/* Publish / Draft */}
          <button type="button"
            onClick={() => isPublished ? onUnpublishPage?.() : onPublishPage?.()}
            disabled={isPublishing}
            style={{
              display: 'flex', alignItems: 'center',
              fontSize: 11, fontWeight: 700,
              padding: '4px 13px', borderRadius: 7,
              border: '1px solid', cursor: isPublishing ? 'default' : 'pointer',
              opacity: isPublishing ? 0.6 : 1,
              flexShrink: 0,
              transition: 'opacity 150ms',
              ...(isPublished
                ? { background: 'rgba(16,185,129,0.12)', color: '#34d399', borderColor: 'rgba(52,211,153,0.3)' }
                : { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', borderColor: 'transparent', boxShadow: '0 1px 8px rgba(99,102,241,0.4)' }
              ),
            }}
          >
            {isPublishing ? '...' : isPublished ? 'Publicado' : 'Publicar'}
          </button>
        </div>
      </div>

      {/* ── Corner trigger — only when bar is off-screen ─────────────── */}
      {!barOpen && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, width: 56, height: 56, zIndex: 9999 }}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        >
          <div className="_runlyCornerLine" style={{
            position: 'absolute', top: 0, left: 0,
            width: 44, height: 3,
            background: 'linear-gradient(90deg, #ef4444 0%, #fca5a5 55%, transparent 100%)',
            borderRadius: '0 0 2px 0',
          }} />
          <div className="_runlyCornerLine" style={{
            position: 'absolute', top: 0, left: 0,
            width: 3, height: 44,
            background: 'linear-gradient(180deg, #ef4444 0%, #fca5a5 55%, transparent 100%)',
            borderRadius: '0 0 2px 0',
          }} />
        </div>
      )}
    </>
  )
}
