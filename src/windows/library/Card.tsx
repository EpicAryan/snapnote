import { displayName, formatDate } from '../../lib/format'
import type { ScreenshotCard } from '../../lib/types'
import { useThumbnail } from '../../lib/useThumbnail'
import { useInView } from './useInView'

interface Props {
  card: ScreenshotCard
  selected: boolean
  onSelect(): void
  onOpen(): void
  /** Open the actions menu at a screen position. */
  onMenu(x: number, y: number): void
}

export function Card({ card, selected, onSelect, onOpen, onMenu }: Props) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const thumb = useThumbnail(card.id, inView)
  const missing = card.status === 'missing'
  return (
    <div ref={ref} data-testid="card" data-card={card.id} role="option" aria-selected={selected} tabIndex={-1}
      onClick={onSelect} onDoubleClick={onOpen}
      onContextMenu={(e) => { e.preventDefault(); onSelect(); onMenu(e.clientX, e.clientY) }}
      className={`group/card relative cursor-pointer rounded-lg border p-2 ${
        selected ? 'border-sky-500 bg-neutral-800 group-focus-within/grid:ring-2 group-focus-within/grid:ring-sky-400/60' : 'border-neutral-800 hover:border-neutral-600'
      } ${missing ? 'opacity-60' : ''}`}>
      <div className="relative aspect-video overflow-hidden rounded bg-neutral-800">
        {thumb ? <img src={thumb} alt="Screenshot thumbnail" className="h-full w-full object-cover" /> : <div className="h-full w-full" />}
        {missing && <span className="absolute bottom-1 right-1 rounded bg-red-700 px-1 text-[10px]">Missing</span>}
        {card.pending_move_to != null && <span className="absolute left-1 top-1 rounded bg-amber-700 px-1 text-[10px]">Move pending</span>}
        <button type="button" aria-label="More actions" title="More actions"
          className={`absolute right-1 top-1 rounded bg-neutral-900/80 px-1.5 text-sm leading-5 hover:bg-neutral-700 focus:opacity-100 ${selected ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'}`}
          onClick={(e) => { e.stopPropagation(); onSelect(); const r = e.currentTarget.getBoundingClientRect(); onMenu(r.left, r.bottom + 2) }}
          onDoubleClick={(e) => e.stopPropagation()}>⋯</button>
      </div>
      <div data-testid="card-title" className={`mt-1 truncate text-sm ${card.label ? '' : 'text-neutral-500'}`}>{displayName(card)}</div>
      {card.notes && <div className="truncate text-xs text-neutral-500">{card.notes}</div>}
      <div className="flex justify-between text-xs text-neutral-400">
        <span className="truncate">{card.destination_name}</span>
        <span>{formatDate(card.captured_at)}</span>
      </div>
    </div>
  )
}
