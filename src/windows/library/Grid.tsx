import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { ScreenshotCard } from '../../lib/types'
import { Card } from './Card'

interface Props {
  cards: ScreenshotCard[]
  selectedId: number | null
  emptyText: string
  onSelect(id: number): void
  onOpen(id: number): void
  onMenu(id: number, x: number, y: number): void
}

/** How many cards share the first row. Falls back to a guess where there is no layout (tests). */
export function columnsOf(grid: HTMLElement | null): number {
  if (!grid) return 1
  const els = Array.from(grid.querySelectorAll<HTMLElement>('[data-card]'))
  if (els.length < 2) return 1
  const top = els[0].offsetTop
  const wrap = els.findIndex((el, i) => i > 0 && el.offsetTop !== top)
  if (wrap > 0) return wrap
  return grid.clientWidth > 0 ? els.length : 4
}

/** The card grid. Keyboard handling lives in Library so it works wherever focus is. */
export const Grid = forwardRef<HTMLDivElement, Props>(function Grid({ cards, selectedId, emptyText, onSelect, onOpen, onMenu }, ref) {
  const inner = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => inner.current as HTMLDivElement)

  useEffect(() => {
    if (selectedId == null) return
    const el = inner.current?.querySelector<HTMLElement>(`[data-card="${selectedId}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedId])

  return (
    <div ref={inner} data-testid="grid" role="listbox" aria-label="Screenshots" tabIndex={0} className="group/grid min-h-full outline-none">
      {cards.length === 0 ? (
        <div className="p-8 text-center text-sm text-neutral-500">{emptyText}</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 p-3">
          {cards.map((c) => (
            <Card key={c.id} card={c} selected={c.id === selectedId} onSelect={() => onSelect(c.id)} onOpen={() => onOpen(c.id)} onMenu={(x, y) => onMenu(c.id, x, y)} />
          ))}
        </div>
      )}
    </div>
  )
})
