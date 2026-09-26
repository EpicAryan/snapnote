import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

export type MenuItem =
  | { label: string; shortcut?: string; onSelect(): void; disabled?: boolean; danger?: boolean }
  | 'separator'

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose(): void
  label?: string
}

/** Right-click style menu with keyboard support. Focus goes back to where it was when it closes. */
export function ContextMenu({ x, y, items, onClose, label = 'Actions' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const restore = useRef<Element | null>(null)
  const [pos, setPos] = useState({ x, y })
  const enabled = items.map((it, i) => (it !== 'separator' && !it.disabled ? i : -1)).filter((i) => i >= 0)
  const [active, setActive] = useState(enabled[0] ?? -1)

  const close = () => {
    onClose()
    const r = restore.current
    if (r instanceof HTMLElement) r.focus()
  }
  const closeRef = useRef(close)
  closeRef.current = close

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    restore.current = document.activeElement
    const el = ref.current
    if (!el) return
    setPos({
      x: Math.max(0, Math.min(x, window.innerWidth - el.offsetWidth - 4)),
      y: Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight - 4)),
    })
  }, [x, y])

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    ;(el ?? ref.current)?.focus()
  }, [active])

  useEffect(() => {
    const onDown = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current() }
    const onAway = () => closeRef.current()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('blur', onAway)
    window.addEventListener('resize', onAway)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', onAway)
      window.removeEventListener('resize', onAway)
    }
  }, [])

  const step = (dir: 1 | -1) => {
    if (!enabled.length) return
    const i = enabled.indexOf(active)
    setActive(enabled[(i + dir + enabled.length) % enabled.length])
  }
  const pick = (i: number) => {
    const it = items[i]
    if (!it || it === 'separator' || it.disabled) return
    close()
    it.onSelect()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); step(1); break
      case 'ArrowUp': e.preventDefault(); step(-1); break
      case 'Home': e.preventDefault(); setActive(enabled[0] ?? -1); break
      case 'End': e.preventDefault(); setActive(enabled[enabled.length - 1] ?? -1); break
      case 'Enter': case ' ': e.preventDefault(); pick(active); break
      case 'Escape': case 'Tab': e.preventDefault(); close(); break
    }
  }

  return (
    <div ref={ref} role="menu" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.x, top: pos.y }} className="fixed z-50 min-w-48 rounded-md border border-neutral-700 bg-neutral-900 p-1 text-sm shadow-xl outline-none">
      {items.map((it, i) =>
        it === 'separator' ? (
          <div key={i} role="separator" className="my-1 border-t border-neutral-800" />
        ) : (
          <button key={i} type="button" role="menuitem" tabIndex={-1} data-index={i} disabled={it.disabled}
            onMouseEnter={() => { if (!it.disabled) setActive(i) }} onClick={() => pick(i)}
            className={`flex w-full items-center justify-between gap-6 rounded px-2 py-1 text-left ${
              it.disabled ? 'text-neutral-600' : active === i ? (it.danger ? 'bg-red-900/60 text-red-200' : 'bg-neutral-700') : it.danger ? 'text-red-300' : ''
            }`}>
            <span>{it.label}</span>
            {it.shortcut && <span className="text-xs text-neutral-400">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  )
}
