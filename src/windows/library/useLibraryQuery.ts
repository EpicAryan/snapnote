import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCommands } from '../../lib/CommandsContext'
import { useDebounced } from '../../lib/useDebounced'
import type { ListQuery, ScreenshotCard, Sort } from '../../lib/types'

export const PAGE_SIZE = 200

export function useLibraryQuery() {
  const cmd = useCommands()
  const [q, setQ] = useState('')
  const [destination, setDestination] = useState<number | null>(null)
  const [unlabeledOnly, setUnlabeledOnly] = useState(false)
  const [sort, setSort] = useState<Sort>('newest')
  const [cards, setCards] = useState<ScreenshotCard[]>([])
  const [loading, setLoading] = useState(true)
  const [pages, setPages] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const seq = useRef(0)
  const debouncedQ = useDebounced(q, 150)

  const filters = useMemo<Partial<ListQuery>>(
    () => ({ q: debouncedQ, destination_id: destination, unlabeled_only: unlabeledOnly, sort }),
    [debouncedQ, destination, unlabeledOnly, sort],
  )

  // A new filter set starts again from the first page.
  useEffect(() => { setPages(1) }, [filters])

  const reload = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    try {
      const results = await Promise.all(
        Array.from({ length: pages }, (_, i) => cmd.listScreenshots({ ...filters, limit: PAGE_SIZE, offset: i * PAGE_SIZE })),
      )
      if (mine !== seq.current) return // a newer request superseded this one
      setCards(results.flat())
      setHasMore((results[results.length - 1]?.length ?? 0) === PAGE_SIZE)
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [cmd, filters, pages])

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    const unsubs: Array<() => void> = []
    const events = ['screenshot:new', 'screenshot:updated', 'screenshot:removed', 'library:refresh'] as const
    events.forEach((e) => { cmd.on(e, () => { void reload() }).then((u) => unsubs.push(u)) })
    return () => unsubs.forEach((u) => u())
  }, [cmd, reload])

  const loadMore = useCallback(() => setPages((p) => p + 1), [])

  return { q, setQ, destination, setDestination, unlabeledOnly, setUnlabeledOnly, sort, setSort, cards, loading, reload, hasMore, loadMore }
}
