import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCommands } from '../../lib/CommandsContext'
import { useDebounced } from '../../lib/useDebounced'
import type { ListQuery, ScreenshotCard, Sort } from '../../lib/types'

export function useLibraryQuery() {
  const cmd = useCommands()
  const [q, setQ] = useState('')
  const [destination, setDestination] = useState<number | null>(null)
  const [unlabeledOnly, setUnlabeledOnly] = useState(false)
  const [sort, setSort] = useState<Sort>('newest')
  const [cards, setCards] = useState<ScreenshotCard[]>([])
  const [loading, setLoading] = useState(true)
  const debouncedQ = useDebounced(q, 150)

  const query = useMemo<Partial<ListQuery>>(
    () => ({ q: debouncedQ, destination_id: destination, unlabeled_only: unlabeledOnly, sort }),
    [debouncedQ, destination, unlabeledOnly, sort],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    try { setCards(await cmd.listScreenshots(query)) } finally { setLoading(false) }
  }, [cmd, query])

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    const unsubs: Array<() => void> = []
    const events = ['screenshot:new', 'screenshot:updated', 'screenshot:removed', 'library:refresh'] as const
    events.forEach((e) => { cmd.on(e, () => { void reload() }).then((u) => unsubs.push(u)) })
    return () => unsubs.forEach((u) => u())
  }, [cmd, reload])

  return { q, setQ, destination, setDestination, unlabeledOnly, setUnlabeledOnly, sort, setSort, cards, loading, reload }
}
