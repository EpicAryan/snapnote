import type { AddReport } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09-26T01:57:47" -> "26 Sep 2026". Anything unparseable is returned as-is. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const month = MONTHS[Number(m[2]) - 1]
  if (!month) return iso
  return `${Number(m[3])} ${month} ${m[1]}`
}

export function displayName(x: { label: string; original_name: string }): string {
  return x.label || x.original_name
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

/** One line for the flash bar after a paste or a drop. */
export function describeAdd(r: AddReport): string {
  const parts: string[] = []
  if (r.added.length === 1) parts.push(`Added ${baseName(r.added[0])}`)
  else if (r.added.length > 1) parts.push(`Added ${r.added.length} images`)
  if (r.existing.length) parts.push(`${r.existing.length} already in the library`)
  if (r.skipped.length === 1) parts.push(`skipped ${r.skipped[0].path} (${r.skipped[0].reason})`)
  else if (r.skipped.length > 1) parts.push(`skipped ${r.skipped.length} files`)
  return parts.length ? parts.join(' · ') : 'Nothing to add'
}
