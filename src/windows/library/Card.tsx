import { displayName, formatDate } from '../../lib/format'
import type { ScreenshotCard } from '../../lib/types'
import { useThumbnail } from '../../lib/useThumbnail'
import { useInView } from './useInView'

export function Card({ card, selected, onSelect, onOpen }: { card: ScreenshotCard; selected: boolean; onSelect(): void; onOpen(): void }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const thumb = useThumbnail(card.id, inView)
  return (
    <div ref={ref} data-testid="card" role="option" aria-selected={selected} tabIndex={-1}
      onClick={onSelect} onDoubleClick={onOpen}
      className={`cursor-pointer rounded-lg border p-2 ${selected ? 'border-sky-500 bg-neutral-800' : 'border-neutral-800 hover:border-neutral-600'}`}>
      <div className="relative aspect-video overflow-hidden rounded bg-neutral-800">
        {thumb ? <img src={thumb} alt="Screenshot thumbnail" className="h-full w-full object-cover" /> : <div className="h-full w-full" />}
        {card.status === 'missing' && <span className="absolute right-1 top-1 rounded bg-red-700 px-1 text-[10px]">Missing</span>}
        {card.pending_move_to != null && <span className="absolute left-1 top-1 rounded bg-amber-700 px-1 text-[10px]">Move pending</span>}
      </div>
      <div data-testid="card-title" className={`mt-1 truncate text-sm ${card.label ? '' : 'text-neutral-500'}`}>{displayName(card)}</div>
      <div className="flex justify-between text-xs text-neutral-400">
        <span className="truncate">{card.destination_name}</span>
        <span>{formatDate(card.captured_at)}</span>
      </div>
    </div>
  )
}
