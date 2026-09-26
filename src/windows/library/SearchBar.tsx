import { forwardRef, type ReactNode } from 'react'
import type { Sort } from '../../lib/types'

interface Props {
  q: string; onQ(v: string): void
  sort: Sort; onSort(v: Sort): void
  extra?: ReactNode
}

export const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(p, ref) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 p-3">
      <input ref={ref} type="search" role="searchbox" placeholder="Search labels, notes and tags…  ( / )" value={p.q} onChange={(e) => p.onQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); if (p.q) p.onQ(''); else e.currentTarget.blur() } }}
        className="min-w-64 flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm" />
      <select aria-label="Sort" value={p.sort} onChange={(e) => p.onSort(e.target.value as Sort)} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>
      {p.extra}
    </div>
  )
})
