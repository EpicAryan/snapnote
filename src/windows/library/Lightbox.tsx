import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useCommands } from '../../lib/CommandsContext'
import { displayName, formatDate } from '../../lib/format'
import type { ScreenshotCard } from '../../lib/types'

interface Props {
  card: ScreenshotCard
  index: number
  count: number
  onStep(delta: 1 | -1): void
  onClose(): void
  onOpen(): void
  onCopy(): void
  onEdit(): void
  onDelete(): void
}

/** Full-window preview. Arrow keys walk the current result list. */
export function Lightbox({ card, index, count, onStep, onClose, onOpen, onCopy, onEdit, onDelete }: Props) {
  const cmd = useCommands()
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const seq = useRef(0)
  const missing = card.status === 'missing'

  useEffect(() => {
    const mine = ++seq.current
    setSrc(null)
    setFailed(missing)
    if (missing) return
    cmd.imageDataUrl(card.id).then(
      (u) => { if (mine === seq.current) setSrc(u) },
      () => { if (mine === seq.current) setFailed(true) },
    )
  }, [cmd, card.id, missing])

  useEffect(() => { ref.current?.focus() }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const onButton = (e.target as HTMLElement).tagName === 'BUTTON'
    const ctrl = e.ctrlKey || e.metaKey
    const handle = (fn: () => void) => { e.preventDefault(); e.stopPropagation(); fn() }
    if (e.key === 'Escape') return handle(onClose)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') return handle(() => onStep(1))
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') return handle(() => onStep(-1))
    if (e.key === 'Delete') return handle(onDelete)
    if (e.key === 'F2') return handle(onEdit)
    if (ctrl && e.key.toLowerCase() === 'c') return handle(onCopy)
    if (onButton) return
    if (e.key === ' ') return handle(onClose)
    if (e.key === 'Enter') return handle(onOpen)
  }
  const stop = (e: MouseEvent) => e.stopPropagation()
  const btn = 'rounded bg-neutral-800/90 px-2 py-1 text-xs hover:bg-neutral-700 disabled:opacity-40'

  return (
    <div ref={ref} role="dialog" aria-label="Preview" aria-modal="true" tabIndex={-1} onKeyDown={onKeyDown} onClick={onClose}
      className="fixed inset-0 z-40 flex flex-col bg-black/90 outline-none">
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm" onClick={stop}>
        <div className="min-w-0">
          <div className="truncate font-medium">{displayName(card)}</div>
          <div className="text-xs text-neutral-400">{index + 1} of {count} · {card.destination_name} · {formatDate(card.captured_at)}</div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button className={btn} onClick={onOpen} disabled={missing}>Open</button>
          <button className={btn} onClick={onCopy} disabled={missing}>Copy</button>
          <button className={btn} onClick={onEdit}>Edit details</button>
          <button className={`${btn} text-red-300`} onClick={onDelete}>Delete</button>
          <button className={btn} aria-label="Close preview" title="Close (Esc)" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        <button aria-label="Previous" title="Previous (←)" disabled={index <= 0} onClick={(e) => { stop(e); onStep(-1) }}
          className="absolute left-3 rounded-full bg-neutral-800/80 px-3 py-2 text-lg disabled:opacity-30">‹</button>
        {src ? (
          <img src={src} alt={`Preview of ${displayName(card)}`} onClick={stop} className="max-h-full max-w-full object-contain" />
        ) : (
          <div className="text-sm text-neutral-400" onClick={stop}>{failed ? 'The file is missing, so there is nothing to preview.' : 'Loading…'}</div>
        )}
        <button aria-label="Next" title="Next (→)" disabled={index >= count - 1} onClick={(e) => { stop(e); onStep(1) }}
          className="absolute right-3 rounded-full bg-neutral-800/80 px-3 py-2 text-lg disabled:opacity-30">›</button>
      </div>
      {card.notes && <div className="max-h-24 overflow-auto px-4 pb-3 text-sm text-neutral-300" onClick={stop}>{card.notes}</div>}
    </div>
  )
}
