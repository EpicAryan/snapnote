import type { Destination, LibraryCounts } from '../../lib/types'

interface Props {
  counts: LibraryCounts | null
  destinations: Destination[]
  destination: number | null
  unlabeledOnly: boolean
  tag: string | null
  onAll(): void
  onUnlabeled(): void
  onDestination(id: number): void
  onTag(tag: string | null): void
  onManage(): void
}

/** Folder and tag filters with live counts, Explorer-style, in place of the old dropdowns. */
export function Sidebar(p: Props) {
  const c = p.counts
  const countFor = (id: number) => c?.by_destination.find((d) => d.destination_id === id)?.count ?? 0
  const row = (key: string, active: boolean, label: string, count: number | null, onClick: () => void) => (
    <button key={key} type="button" aria-pressed={active} aria-label={count != null ? `${label}, ${count}` : label} onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm ${active ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-300 hover:bg-neutral-900'}`}>
      <span className="truncate">{label}</span>
      {count != null && <span className="text-xs text-neutral-500">{count}</span>}
    </button>
  )
  const allActive = p.destination == null && !p.unlabeledOnly
  return (
    <nav aria-label="Filters" className="flex w-52 shrink-0 flex-col gap-3 overflow-auto border-r border-neutral-800 p-2">
      <div>
        {row('all', allActive, 'All screenshots', c?.total ?? null, p.onAll)}
        {row('unlabeled', p.unlabeledOnly, 'Unlabeled', c?.unlabeled ?? null, p.onUnlabeled)}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          <span>Folders</span>
          <button type="button" className="font-normal normal-case tracking-normal text-neutral-500 hover:text-neutral-200" onClick={p.onManage}>Manage</button>
        </div>
        {p.destinations.map((d) => row(`d${d.id}`, p.destination === d.id, d.is_default ? 'Screenshots (Default)' : d.name, countFor(d.id), () => p.onDestination(d.id)))}
      </div>
      {c && c.tags.length > 0 && (
        <div>
          <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Tags</div>
          {c.tags.map((t) => row(`t${t.tag}`, p.tag === t.tag, `#${t.tag}`, t.count, () => p.onTag(p.tag === t.tag ? null : t.tag)))}
        </div>
      )}
      {c && c.missing > 0 && <div className="px-2 text-xs text-neutral-500">{c.missing} missing file{c.missing === 1 ? '' : 's'}</div>}
    </nav>
  )
}
