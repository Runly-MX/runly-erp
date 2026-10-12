import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils.js'
import { useIsMobile } from '../hooks/useIsMobile.js'
import { useCoarsePointer } from '../hooks/usePointerCapabilities.js'

// WhatsApp / Telegram style swipeable list row (touch only).
//
//   swipe LEFT   -> reveals a tray of `rightActions` buttons; snaps open at
//                   half the tray width, tap-outside / scroll / opening
//                   another row closes it.
//   swipe RIGHT  -> past `fullSwipeThreshold` px fires `onFullSwipeRight`
//                   once and snaps back (no tray).
//
// On non-touch pointers the gesture layer is inert and `children` render as-is
// (desktop uses the ContextMenu instead). Axis is locked on the first few px
// of movement so vertical list scrolling is never hijacked.

const BUTTON_WIDTH = 76 // px per action button in the left-swipe tray

export function SwipeableRow({
  children,
  rightActions = [],
  onFullSwipeRight = null,
  fullSwipeLabel = '',
  fullSwipeIcon: FullSwipeIcon = null,
  fullSwipeTone = 'default', // 'default' | 'primary' | 'danger'
  fullSwipeThreshold = 96,
  onLongPress = null,
  longPressDelay = 500,
  open = false,
  onOpenChange = null,
  disabled = false,
  className = '',
}) {
  const isMobile = useIsMobile(1024)
  const coarse = useCoarsePointer()
  const gestureEnabled = !disabled && isMobile && coarse

  const trayWidth = Math.min(rightActions.length, 3) * BUTTON_WIDTH
  const hasTray = trayWidth > 0

  const containerRef = useRef(null)
  const startRef = useRef({ x: 0, y: 0, base: 0, axis: null, fired: false })
  const longPressRef = useRef(null)
  const longPressedRef = useRef(false)
  const [tx, setTx] = useState(0)
  const [dragging, setDragging] = useState(false)

  const clearLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }, [])

  useEffect(() => clearLongPress, [clearLongPress])

  // Sync to controlled `open`
  useEffect(() => {
    if (dragging) return
    setTx(open && hasTray ? -trayWidth : 0)
  }, [open, hasTray, trayWidth, dragging])

  const close = useCallback(() => {
    setTx(0)
    onOpenChange?.(false)
  }, [onOpenChange])

  const onPointerDown = (e) => {
    if (!gestureEnabled || e.pointerType === 'mouse') return
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      base: tx,
      axis: null,
      fired: false,
    }
    longPressedRef.current = false
    setDragging(true)
    if (onLongPress && tx === 0) {
      clearLongPress()
      longPressRef.current = setTimeout(() => {
        longPressedRef.current = true
        setDragging(false)
        setTx(0)
        onLongPress()
      }, longPressDelay)
    }
  }

  const onPointerMove = (e) => {
    if (!dragging) return
    const s = startRef.current
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y

    if (longPressRef.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      clearLongPress()
    }

    if (!s.axis) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        // vertical intent -> hand back to the scroll container
        s.axis = 'y'
        setDragging(false)
        setTx(s.base)
        return
      }
      if (Math.abs(dx) > 8) {
        s.axis = 'x'
        containerRef.current?.setPointerCapture?.(e.pointerId)
      } else {
        return
      }
    }
    if (s.axis !== 'x') return
    e.preventDefault?.()

    let next = s.base + dx
    // resistance past the natural stops
    if (next > 0) {
      if (!onFullSwipeRight) next = next * 0.15
      else next = Math.min(next, fullSwipeThreshold + 40)
    } else if (next < -trayWidth) {
      next = -trayWidth + (next + trayWidth) * 0.3
    }
    setTx(next)
  }

  const onPointerUp = () => {
    clearLongPress()
    if (longPressedRef.current) return
    if (!dragging) return
    const s = startRef.current
    setDragging(false)
    if (s.axis !== 'x') return

    if (onFullSwipeRight && tx >= fullSwipeThreshold) {
      if (!s.fired) {
        s.fired = true
        onFullSwipeRight()
      }
      setTx(0)
      onOpenChange?.(false)
      return
    }
    if (hasTray && tx <= -trayWidth / 2) {
      setTx(-trayWidth)
      onOpenChange?.(true)
      return
    }
    close()
  }

  if (!gestureEnabled) return <div className={className}>{children}</div>

  const toneBg = {
    default: 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]',
    primary: 'bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)]',
    danger: 'bg-red-600 text-white',
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden touch-pan-y', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* left-swipe full-action backdrop */}
      {onFullSwipeRight && tx > 0 && (
        <div
          className={cn(
            'absolute inset-y-0 left-0 flex items-center gap-2 px-4 text-sm font-medium',
            toneBg[fullSwipeTone] ?? toneBg.default,
          )}
          style={{ width: Math.max(tx, 0) }}
        >
          {FullSwipeIcon && <FullSwipeIcon className="h-5 w-5 shrink-0" />}
          {tx > 60 && <span className="truncate">{fullSwipeLabel}</span>}
        </div>
      )}

      {/* right-swipe action tray */}
      {hasTray && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: trayWidth }}>
          {rightActions.slice(0, 3).map((a) => {
            const Icon = a.icon
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => {
                  a.onSelect?.()
                  close()
                }}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  toneBg[a.tone] ?? toneBg.default,
                )}
                style={{ width: BUTTON_WIDTH }}
              >
                {Icon && <Icon className="h-5 w-5" />}
                <span className="px-1 leading-tight">{a.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* the row itself */}
      <div
        className={cn('relative bg-[hsl(var(--background))]', !dragging && 'transition-transform duration-200 ease-out')}
        style={{ transform: `translate3d(${tx}px,0,0)` }}
      >
        {open && hasTray && (
          // tap the row while the tray is open -> close instead of activating
          <button
            type="button"
            aria-label="Cerrar acciones"
            className="absolute inset-0 z-10"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              close()
            }}
          />
        )}
        {children}
      </div>
    </div>
  )
}
