import { forwardRef, type ReactNode } from 'react'
import type { Destination, Sort } from '../../lib/types'

interface Props {
  q: string; onQ(v: string): void
  destinations: Destination[]; destination: number | null; onDestination(v: number | null): void
  unlabeledOnly: boolean; onUnlabeledOnly(v: boolean): void
  sort: Sort; onSort(v: Sort): void
  extra?: ReactNode
}

export const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(p, ref) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 p-3">
      <input ref={ref} type="search" role="searchbox" placeholder="Search labels and notes…  ( / )" value={p.q} onChange={(e) => p.onQ(e.target.value)}
        className="min-w-64 flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm" />
      <select aria-label="Destination filter" value={p.destination ?? ''} onChange={(e) => p.onDestination(e.target.value ? Number(e.target.value) : null)}
        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm">
        <option value="">All destinations</option>
        {p.destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" aria-label="Unlabeled only" checked={p.unlabeledOnly} onChange={(e) => p.onUnlabeledOnly(e.target.checked)} />
        Unlabeled only
      </label>
      <select aria-label="Sort" value={p.sort} onChange={(e) => p.onSort(e.target.value as Sort)} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>
      {p.extra}
    </div>
  )
})
