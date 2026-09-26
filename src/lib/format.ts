import type { AddReport, DeleteReport, MoveReport, UndoReport } from './types'

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

export const MAX_TAG_LEN = 40
export const MAX_TAGS = 50

/** Mirrors the Rust normalisation: lowercase, spaces and hyphens become one hyphen, punctuation dropped. */
export function normalizeTag(raw: string): string {
  let out = ''
  let pendingDash = false
  for (const ch of raw.trim().toLowerCase()) {
    if (/[\p{L}\p{N}_.]/u.test(ch)) {
      if (pendingDash && out) out += '-'
      pendingDash = false
      out += ch
    } else if (/[\s-]/.test(ch)) {
      pendingDash = true
    }
  }
  return out.replace(/^[-.]+|[-.]+$/g, '').slice(0, MAX_TAG_LEN)
}

export function normalizeTags(raw: string[]): string[] {
  const out: string[] = []
  for (const r of raw) {
    const t = normalizeTag(r)
    if (t && !out.includes(t)) {
      out.push(t)
      if (out.length === MAX_TAGS) break
    }
  }
  return out
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeDelete(r: DeleteReport): string {
  const parts: string[] = []
  if (r.trashed) parts.push(`Moved ${plural(r.trashed, 'screenshot', 'screenshots')} to the Recycle Bin`)
  const forgotten = r.deleted.length - r.trashed
  if (forgotten > 0) parts.push(`removed ${plural(forgotten, 'missing entry', 'missing entries')}`)
  if (r.failed.length) parts.push(`${r.failed.length} failed: ${r.failed[0].reason}`)
  return parts.length ? parts.join(' · ') : 'Nothing deleted'
}

export function describeUndo(r: UndoReport): string {
  const parts: string[] = []
  if (r.restored.length) parts.push(`Restored ${plural(r.restored.length, 'screenshot', 'screenshots')}`)
  if (r.failed.length) parts.push(`${plural(r.failed.length, 'problem', 'problems')}: ${r.failed[0].reason}`)
  return parts.length ? parts.join(' · ') : 'Nothing to restore'
}

export function describeMove(r: MoveReport): string {
  const to = r.destination ? ` to ${r.destination.name}` : ''
  const parts: string[] = []
  if (r.moved) parts.push(`Moved ${r.moved}${to}`)
  if (r.unchanged) parts.push(`${r.unchanged} already there`)
  if (r.pending) parts.push(`${r.pending} could not be moved yet (use Retry move)`)
  if (r.failed.length) parts.push(`${r.failed.length} failed: ${r.failed[0].reason}`)
  return parts.length ? parts.join(' · ') : 'Nothing moved'
}
