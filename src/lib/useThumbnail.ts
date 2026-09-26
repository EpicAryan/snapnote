import { useEffect, useState } from 'react'
import { useCommands } from './CommandsContext'

const cache = new Map<number, string>()

/** Resolves a thumbnail URL once per id per page load; null while loading or on failure. */
export function useThumbnail(id: number, enabled = true): string | null {
  const cmd = useCommands()
  const [url, setUrl] = useState<string | null>(cache.get(id) ?? null)
  useEffect(() => {
    if (!enabled || cache.has(id)) { setUrl(cache.get(id) ?? null); return }
    let alive = true
    cmd.thumbnailUrl(id).then((u) => { if (alive) { cache.set(id, u); setUrl(u) } }).catch(() => { if (alive) setUrl(null) })
    return () => { alive = false }
  }, [cmd, id, enabled])
  return url
}

export function forgetThumbnail(id: number) { cache.delete(id) }
export function forgetAllThumbnails() { cache.clear() }
