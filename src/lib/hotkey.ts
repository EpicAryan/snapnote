const MODS = ['Ctrl', 'Alt', 'Shift', 'Super'] as const
const CANON: Record<string, string> = { ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', shift: 'Shift', super: 'Super', win: 'Super', cmd: 'Super', meta: 'Super' }

export function normalizeHotkey(s: string): string {
  const parts = s.split('+').map((p) => p.trim()).filter(Boolean)
  const mods: string[] = []
  const keys: string[] = []
  for (const p of parts) {
    const c = CANON[p.toLowerCase()]
    if (c) { if (!mods.includes(c)) mods.push(c) } else keys.push(p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1).toLowerCase())
  }
  mods.sort((a, b) => MODS.indexOf(a as typeof MODS[number]) - MODS.indexOf(b as typeof MODS[number]))
  return [...mods, ...keys].join('+')
}

/** Valid = exactly one key plus at least one of Ctrl/Alt/Super (Shift alone is not enough). */
export function isValidHotkey(s: string): boolean {
  const n = normalizeHotkey(s)
  if (!n) return false
  const parts = n.split('+')
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1)
  if (!key || (MODS as readonly string[]).includes(key)) return false
  return mods.some((m) => m === 'Ctrl' || m === 'Alt' || m === 'Super')
}
