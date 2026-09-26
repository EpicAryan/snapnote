import type { KeyboardEvent } from 'react'
import type { ScreenshotCard } from '../../lib/types'
import { Card } from './Card'

interface Props { cards: ScreenshotCard[]; selectedId: number | null; onSelect(id: number): void; onOpen(id: number): void; onDeleteRequest(id: number): void }

export function Grid({ cards, selectedId, onSelect, onOpen, onDeleteRequest }: Props) {
  const idx = cards.findIndex((c) => c.id === selectedId)
  const move = (delta: number) => { const next = cards[Math.min(cards.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + delta))]; if (next) onSelect(next.id) }
  const onKeyDown = (e: KeyboardEvent) => {
    const cols = Math.max(1, Math.floor((e.currentTarget as HTMLElement).clientWidth / 220) || 4)
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); move(1); break
      case 'ArrowLeft': e.preventDefault(); move(-1); break
      case 'ArrowDown': e.preventDefault(); move(cols); break
      case 'ArrowUp': e.preventDefault(); move(-cols); break
      case 'Enter': if (selectedId != null) { e.preventDefault(); onOpen(selectedId) } break
      case 'Delete': if (selectedId != null) { e.preventDefault(); onDeleteRequest(selectedId) } break
    }
  }
  if (cards.length === 0) return <div className="p-8 text-center text-sm text-neutral-500">No screenshots match.</div>
  return (
    <div data-testid="grid" role="listbox" tabIndex={0} onKeyDown={onKeyDown}
      className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 p-3 outline-none">
      {cards.map((c) => <Card key={c.id} card={c} selected={c.id === selectedId} onSelect={() => onSelect(c.id)} onOpen={() => onOpen(c.id)} />)}
    </div>
  )
}
