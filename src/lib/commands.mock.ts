import type { Commands, Events, Unlisten } from './commands'
import { normalizeTags } from './format'
import type {
  AddReport, AppError, DeleteReport, Destination, DestinationChoice, LibraryCounts, ListQuery, MoveReport, RecentLabel,
  SaveResult, Screenshot, ScreenshotCard, Settings, UndoReport,
} from './types'
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
  state: { screenshots: Screenshot[]; destinations: Destination[]; settings: Settings; folders: Set<string>; trash: Screenshot[] }
  setPickFolderResult(v: string | null): void
  setConfirmResult(v: boolean): void
  /** What the next paste finds: files (Explorer copy) win over an image. Defaults to an image. */
  setClipboard(v: { image?: boolean; files?: string[] }): void
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
    tags: [] as string[],
    destination_id: 1,
    status: 'present' as const,
    pending_move_to: null,
    created_at: now,
    updated_at: now,
  }))
  const screenshots: Screenshot[] = seed.screenshots
    ? seed.screenshots.map((s, i) => ({ ...baseShots[i % baseShots.length], id: i + 1, tags: [], ...s }))
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
  const trash: Screenshot[] = []
  const listeners = new Map<string, Set<(p: unknown) => void>>()
  const calls: unknown[][] = []
  let nextId = screenshots.length + 1
  let nextDest = 2
  let pickFolderResult: string | null = 'D:\\ClientX'
  let confirmResult = true
  let clipboard: { image: boolean; files: string[] } = { image: true, files: [] }
  // Save order, so recentLabels can say what was used last (updated_at is a constant here).
  const touched = new Map<number, number>()
  let touchSeq = 0
  let undoSeq = 0
  let lastBatch: { token: number; items: Screenshot[] } | null = null

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
    notes: s.notes,
    tags: s.tags,
    destination_id: s.destination_id,
    destination_name: findDest(s.destination_id).name,
    status: s.status,
    pending_move_to: s.pending_move_to,
  })
  const matches = (s: Screenshot, q: string) => {
    const terms = q.toLowerCase().split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)
    const words = `${s.label} ${s.notes} ${s.tags.join(' ')}`.toLowerCase().split(/[^\p{L}\p{N}]+/u)
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
  const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p
  const addRow = (path: string): Screenshot => {
    const s: Screenshot = { ...baseShots[0], id: nextId++, path, original_name: baseName(path), captured_at: '2026-09-26T12:00:00', label: '', notes: '', tags: [], destination_id: 1, status: 'present', pending_move_to: null }
    screenshots.push(s)
    emit('screenshot:new', { id: s.id })
    return s
  }
  // Mirrors add::plan_add: tracked -> existing; non-image -> skipped; else it lands in the Screenshots folder as a PNG.
  const addPaths = (paths: string[]): AddReport => {
    const report: AddReport = { added: [], existing: [], skipped: [] }
    for (const p of paths) {
      const tracked = screenshots.find((s) => norm(s.path) === norm(p))
      if (tracked) { report.existing.push(tracked.id); continue }
      if (!/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(p)) { report.skipped.push({ path: baseName(p), reason: 'not an image' }); continue }
      const inWatch = norm(p).startsWith(norm(WATCH) + '\\')
      const target = inWatch ? p : `${WATCH}\\${baseName(p).replace(/\.[^.]+$/, '')}.png`
      report.added.push(addRow(target).path)
    }
    return report
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
      let rows = screenshots.filter((s) =>
        (!q.q.trim() || matches(s, q.q))
        && (q.destination_id == null || s.destination_id === q.destination_id)
        && (!q.unlabeled_only || s.label === '')
        && (!q.tag || s.tags.includes(q.tag)))
      rows = rows.sort((a, b) => (a.captured_at < b.captured_at ? 1 : a.captured_at > b.captured_at ? -1 : b.id - a.id))
      if (q.sort === 'oldest') rows = rows.reverse()
      return rows.slice(q.offset, q.offset + q.limit).map(toCard)
    },
    async getScreenshot(id) {
      return { ...find(id), tags: [...find(id).tags] }
    },
    async saveMetadata(id, label, notes, tags, choice) {
      const s = find(id)
      const dest = await resolve(choice)
      s.label = label.trim()
      s.notes = notes.trim()
      s.tags = normalizeTags(tags)
      s.destination_id = dest.id
      s.updated_at = now
      touched.set(id, ++touchSeq)
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
    async deleteScreenshots(ids) {
      calls.push(['deleteScreenshots', ids])
      const report: DeleteReport = { deleted: [], trashed: 0, failed: [], undo_token: ++undoSeq }
      const items: Screenshot[] = []
      for (const id of ids) {
        const i = screenshots.findIndex((s) => s.id === id)
        if (i < 0) { report.failed.push({ id, reason: 'not found' }); continue }
        const [s] = screenshots.splice(i, 1)
        if (s.status === 'present') report.trashed++
        report.deleted.push(id)
        items.push(s)
        trash.push(s)
      }
      lastBatch = items.length ? { token: report.undo_token, items } : null
      emit('library:refresh', {})
      return report
    },
    async undoDelete(token) {
      calls.push(['undoDelete', token])
      if (!lastBatch || lastBatch.token !== token) throw err('InvalidInput', 'That delete can no longer be undone')
      const report: UndoReport = { restored: [], failed: [] }
      for (const s of lastBatch.items) {
        const t = trash.indexOf(s)
        if (t >= 0) trash.splice(t, 1)
        screenshots.push(s)
        report.restored.push(s.id)
      }
      screenshots.sort((a, b) => a.id - b.id)
      lastBatch = null
      emit('library:refresh', {})
      return report
    },
    async copyScreenshots(ids) {
      calls.push(['copyScreenshots', ids])
      const present = ids.filter((id) => screenshots.find((s) => s.id === id)?.status === 'present')
      if (!present.length) throw err('FileMissing', 'Nothing to copy: the file is missing')
      return present.length
    },
    async moveScreenshots(ids, choice) {
      calls.push(['moveScreenshots', ids, choice])
      const dest = await resolve(choice)
      const report: MoveReport = { moved: 0, unchanged: 0, pending: 0, failed: [], destination: dest }
      for (const id of ids) {
        const s = screenshots.find((x) => x.id === id)
        if (!s) { report.failed.push({ id, reason: 'not found' }); continue }
        s.destination_id = dest.id
        const r = applyMove(s, dest)
        if (r.warning) report.pending++
        else if (r.moved) report.moved++
        else report.unchanged++
      }
      emit('library:refresh', {})
      emit('settings:changed', {})
      return report
    },
    async addTags(ids, tags) {
      calls.push(['addTags', ids, tags])
      const extra = normalizeTags(tags)
      let changed = 0
      for (const id of ids) {
        const s = find(id)
        const merged = [...s.tags]
        for (const t of extra) if (!merged.includes(t)) merged.push(t)
        if (merged.length !== s.tags.length) { s.tags = merged; changed++ }
      }
      emit('library:refresh', {})
      return changed
    },
    async recentLabels() {
      const labeled = screenshots.filter((s) => s.label).sort((a, b) => (touched.get(b.id) ?? 0) - (touched.get(a.id) ?? 0))
      const out: RecentLabel[] = []
      for (const s of labeled) {
        const hit = out.find((r) => r.label.toLowerCase() === s.label.toLowerCase())
        if (hit) { hit.uses++; continue }
        out.push({ label: s.label, destination_id: s.destination_id, destination_name: findDest(s.destination_id).name, uses: 1 })
      }
      return out.slice(0, 5)
    },
    async libraryCounts() {
      const tagCounts = new Map<string, number>()
      for (const s of screenshots) for (const t of s.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
      const counts: LibraryCounts = {
        total: screenshots.length,
        unlabeled: screenshots.filter((s) => !s.label).length,
        missing: screenshots.filter((s) => s.status === 'missing').length,
        by_destination: destinations.map((d) => ({ destination_id: d.id, count: screenshots.filter((s) => s.destination_id === d.id).length })).filter((x) => x.count > 0),
        tags: [...tagCounts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
      }
      return counts
    },
    async pasteClipboard() {
      calls.push(['pasteClipboard'])
      if (clipboard.files.length) return addPaths(clipboard.files)
      if (!clipboard.image) throw err('InvalidInput', 'Nothing to paste. Copy an image or image files first.')
      const path = addRow(`${WATCH}\\Screenshot 2026-09-26 120000.png`).path
      return { added: [path], existing: [], skipped: [] }
    },
    async addFiles(paths) {
      calls.push(['addFiles', paths])
      return addPaths(paths)
    },
    async reconcileNow() {
      calls.push(['reconcileNow'])
      return 0
    },
    async confirm(message) {
      calls.push(['confirm', message])
      return confirmResult
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
    state: { screenshots, destinations, settings, folders, trash },
    setPickFolderResult(v) { pickFolderResult = v },
    setConfirmResult(v) { confirmResult = v },
    setClipboard(v) { clipboard = { image: v.image ?? false, files: v.files ?? [] } },
  }
}
