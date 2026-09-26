import type { Commands, Events, Unlisten } from './commands'
import type { AppError, Destination, DestinationChoice, ListQuery, SaveResult, Screenshot, ScreenshotCard, Settings } from './types'
import { DEFAULT_QUERY } from './types'

const WATCH = 'C:\\Users\\me\\OneDrive\\Pictures\\Screenshots'

function err(code: AppError['code'], message: string): AppError {
  return { code, message }
}

export function slugify(label: string): string {
  const out = label
    .trim()
    .toLowerCase()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return out.slice(0, 60).replace(/[-. ]+$/g, '')
}

export interface MockHandle {
  commands: Commands
  emit<E extends keyof Events>(event: E, payload: Events[E]): void
  calls: unknown[][]
  state: { screenshots: Screenshot[]; destinations: Destination[]; settings: Settings; folders: Set<string> }
  setPickFolderResult(v: string | null): void
}

export interface MockSeed {
  screenshots?: Partial<Screenshot>[]
  settings?: Partial<Settings>
}

export function createMockCommands(seed: MockSeed = {}): MockHandle {
  const now = '2026-09-26T02:00:00'
  const destinations: Destination[] = [{ id: 1, name: 'Default', path: WATCH, sort_order: -1, is_default: true }]
  const baseShots: Screenshot[] = [
    ['Screenshot 2026-09-26 015747.png', '2026-09-26T01:57:47'],
    ['Screenshot 2026-09-25 155014.png', '2026-09-25T15:50:14'],
    ['Screenshot 2026-09-25 120602.png', '2026-09-25T12:06:02'],
  ].map(([name, at], i) => ({
    id: i + 1,
    path: `${WATCH}\\${name}`,
    original_name: name,
    captured_at: at,
    size_bytes: 1000 + i,
    hash: `hash${i}`,
    label: '',
    notes: '',
    destination_id: 1,
    status: 'present' as const,
    pending_move_to: null,
    created_at: now,
    updated_at: now,
  }))
  const screenshots: Screenshot[] = seed.screenshots
    ? seed.screenshots.map((s, i) => ({ ...baseShots[i % baseShots.length], id: i + 1, ...s }))
    : baseShots
  const settings: Settings = {
    watch_folder_override: '',
    label_hotkey: 'Ctrl+Shift+L',
    library_hotkey: '',
    toast_seconds: 8,
    rename_on_label: true,
    autostart: true,
    library_window_bounds: '',
    first_run_done: false,
    ...seed.settings,
  }
  const folders = new Set<string>([WATCH, 'D:\\Work\\Embee', 'D:\\ClientX'])
  const listeners = new Map<string, Set<(p: unknown) => void>>()
  const calls: unknown[][] = []
  let nextId = screenshots.length + 1
  let nextDest = 2
  let pickFolderResult: string | null = 'D:\\ClientX'
  void nextId

  const emit: MockHandle['emit'] = (event, payload) => {
    listeners.get(event)?.forEach((h) => h(payload))
  }
  const norm = (p: string) => p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '')
  const find = (id: number) => {
    const s = screenshots.find((x) => x.id === id)
    if (!s) throw err('NotFound', 'not found')
    return s
  }
  const findDest = (id: number) => {
    const d = destinations.find((x) => x.id === id)
    if (!d) throw err('NotFound', 'not found')
    return d
  }
  const toCard = (s: Screenshot): ScreenshotCard => ({
    id: s.id,
    path: s.path,
    original_name: s.original_name,
    captured_at: s.captured_at,
    label: s.label,
    destination_id: s.destination_id,
    destination_name: findDest(s.destination_id).name,
    status: s.status,
    pending_move_to: s.pending_move_to,
  })
  const matches = (s: Screenshot, q: string) => {
    const terms = q.toLowerCase().split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)
    const words = `${s.label} ${s.notes}`.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    return terms.every((t) => words.some((w) => w.startsWith(t)))
  }
  const createDestination = async (name: string, path: string): Promise<Destination> => {
    if (!name.trim() || !path.trim()) throw err('InvalidInput', 'name and path are required')
    if (norm(path) === norm(WATCH) || norm(path).startsWith(norm(WATCH) + '\\')) throw err('InvalidInput', 'destination cannot be the Screenshots folder or a folder inside it')
    if (destinations.some((d) => d.name.toLowerCase() === name.trim().toLowerCase())) throw err('InvalidInput', `a destination named '${name}' already exists`)
    const d: Destination = { id: nextDest++, name: name.trim(), path: path.trim(), sort_order: destinations.length - 1, is_default: false }
    destinations.push(d)
    return d
  }
  const resolve = async (choice: DestinationChoice): Promise<Destination> => {
    if (choice.kind === 'existing') return findDest(choice.id)
    const existing = destinations.find((d) => norm(d.path) === norm(choice.path))
    if (existing) return existing
    const base = choice.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Folder'
    let name = base
    for (let n = 2; destinations.some((d) => d.name.toLowerCase() === name.toLowerCase()); n++) name = `${base}-${n}`
    return createDestination(name, choice.path)
  }
  const applyMove = (s: Screenshot, dest: Destination): SaveResult => {
    if (s.status === 'missing') {
      return { moved: false, renamed: false, path: s.path, destination: dest, warning: 'Saved, but the file no longer exists at its last known location' }
    }
    const dir = s.path.slice(0, s.path.lastIndexOf('\\'))
    const currentName = s.path.slice(s.path.lastIndexOf('\\') + 1)
    const slug = slugify(s.label)
    const targetName = settings.rename_on_label && slug ? `${s.captured_at.slice(0, 10)} ${slug}.png` : currentName
    const targetDir = dest.is_default ? dir : dest.path
    const moved = norm(dir) !== norm(targetDir)
    const renamed = targetName !== currentName
    if (!folders.has(targetDir) && moved) {
      s.pending_move_to = dest.id
      return { moved: false, renamed: false, path: s.path, destination: dest, warning: "Saved, but the file couldn't be moved (folder missing). Use Retry move from the library." }
    }
    s.path = `${targetDir}\\${targetName}`
    s.pending_move_to = null
    return { moved, renamed, path: s.path, destination: dest, warning: null }
  }

  const commands: Commands = {
    async listScreenshots(partial) {
      const q: ListQuery = { ...DEFAULT_QUERY, ...partial }
      let rows = screenshots.filter((s) => (!q.q.trim() || matches(s, q.q)) && (q.destination_id == null || s.destination_id === q.destination_id) && (!q.unlabeled_only || s.label === ''))
      rows = rows.sort((a, b) => (a.captured_at < b.captured_at ? 1 : a.captured_at > b.captured_at ? -1 : b.id - a.id))
      if (q.sort === 'oldest') rows = rows.reverse()
      return rows.slice(q.offset, q.offset + q.limit).map(toCard)
    },
    async getScreenshot(id) {
      return { ...find(id) }
    },
    async saveMetadata(id, label, notes, choice) {
      const s = find(id)
      const dest = await resolve(choice)
      s.label = label.trim()
      s.notes = notes.trim()
      s.destination_id = dest.id
      s.updated_at = now
      const r = applyMove(s, dest)
      emit('screenshot:updated', { id })
      return r
    },
    async retryMove(id) {
      const s = find(id)
      const dest = findDest(s.pending_move_to ?? s.destination_id)
      const r = applyMove(s, dest)
      emit('screenshot:updated', { id })
      return r
    },
    async thumbnailUrl(id) {
      find(id)
      return `mock://thumb/${id}`
    },
    async imageDataUrl(id) {
      find(id)
      return 'data:image/png;base64,iVBORw0KGgo='
    },
    async openFile(id) { calls.push(['openFile', id]) },
    async revealFile(id) { calls.push(['revealFile', id]) },
    async removeFromLibrary(id) {
      const i = screenshots.findIndex((s) => s.id === id)
      if (i < 0) throw err('NotFound', 'not found')
      screenshots.splice(i, 1)
      emit('screenshot:removed', { id })
    },
    async deleteFile(id) {
      calls.push(['deleteFile', id])
      await commands.removeFromLibrary(id)
    },

    async listDestinations() {
      return [...destinations].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.sort_order - b.sort_order || a.id - b.id)
    },
    createDestination,
    async updateDestination(id, name, path) {
      const d = findDest(id)
      if (d.is_default) throw err('InvalidInput', 'the Default destination cannot be edited here')
      if (destinations.some((o) => o.id !== id && o.name.toLowerCase() === name.trim().toLowerCase())) throw err('InvalidInput', `a destination named '${name}' already exists`)
      d.name = name.trim()
      d.path = path.trim()
    },
    async deleteDestination(id, reassignTo) {
      const d = findDest(id)
      if (d.is_default) throw err('InvalidInput', 'the Default destination cannot be deleted')
      findDest(reassignTo)
      screenshots.forEach((s) => { if (s.destination_id === id) s.destination_id = reassignTo; if (s.pending_move_to === id) s.pending_move_to = null })
      destinations.splice(destinations.indexOf(d), 1)
    },
    async reorderDestinations(ids) {
      ids.forEach((id, i) => { const d = destinations.find((x) => x.id === id); if (d && !d.is_default) d.sort_order = i })
    },

    async getSettings() { return { ...settings } },
    async setSetting(key, value) {
      if (key === 'toast_seconds') {
        const n = Number(value)
        if (!Number.isInteger(n) || n < 1 || n > 120) throw err('InvalidInput', 'toast_seconds must be a whole number from 1 to 120')
        settings.toast_seconds = n
      } else if (key === 'rename_on_label' || key === 'autostart' || key === 'first_run_done') {
        if (value !== 'true' && value !== 'false') throw err('InvalidInput', `${key} must be 'true' or 'false'`)
        settings[key] = value === 'true'
      } else {
        settings[key] = value
      }
      emit('settings:changed', {})
    },
    async detectWatchFolder() { return WATCH },
    async importExisting() {
      emit('import:progress', { done: 1, total: 2 })
      emit('import:progress', { done: 2, total: 2 })
      emit('library:refresh', {})
      return { added: 2, skipped: 0 }
    },
    async clearThumbnailCache() { calls.push(['clearThumbnailCache']) },
    async openDataFolder() { calls.push(['openDataFolder']) },

    async pickFolder() {
      calls.push(['pickFolder'])
      return pickFolderResult
    },
    async folderExists(path) { return folders.has(path) },
    async createFolder(path) { folders.add(path) },

    async hideToast() { calls.push(['hideToast']) },
    async openPopupFor(id) { calls.push(['openPopupFor', id]) },
    async hidePopup() { calls.push(['hidePopup']) },
    async labelLastScreenshot() { calls.push(['labelLastScreenshot']) },

    async on(event, handler) {
      const set = listeners.get(event) ?? new Set()
      set.add(handler as (p: unknown) => void)
      listeners.set(event, set)
      const un: Unlisten = () => { set.delete(handler as (p: unknown) => void) }
      return un
    },
  }

  return {
    commands,
    emit,
    calls,
    state: { screenshots, destinations, settings, folders },
    setPickFolderResult(v) { pickFolderResult = v },
  }
}
