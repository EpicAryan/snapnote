export type Status = 'present' | 'missing'
export type Sort = 'newest' | 'oldest'

export interface Destination {
  id: number
  name: string
  path: string
  sort_order: number
  is_default: boolean
}

export interface Screenshot {
  id: number
  path: string
  original_name: string
  captured_at: string
  size_bytes: number
  hash: string
  label: string
  notes: string
  tags: string[]
  destination_id: number
  status: Status
  pending_move_to: number | null
  created_at: string
  updated_at: string
}

export interface ScreenshotCard {
  id: number
  path: string
  original_name: string
  captured_at: string
  label: string
  notes: string
  tags: string[]
  destination_id: number
  destination_name: string
  status: Status
  pending_move_to: number | null
}

export interface ListQuery {
  q: string
  destination_id: number | null
  unlabeled_only: boolean
  /** Exact tag to require. */
  tag: string | null
  sort: Sort
  limit: number
  offset: number
}

export const DEFAULT_QUERY: ListQuery = {
  q: '',
  destination_id: null,
  unlabeled_only: false,
  tag: null,
  sort: 'newest',
  limit: 200,
  offset: 0,
}

export type DestinationChoice = { kind: 'existing'; id: number } | { kind: 'browse'; path: string }

export interface SaveResult {
  moved: boolean
  renamed: boolean
  path: string
  destination: Destination
  warning: string | null
}

export interface Settings {
  watch_folder_override: string
  label_hotkey: string
  library_hotkey: string
  toast_seconds: number
  rename_on_label: boolean
  autostart: boolean
  library_window_bounds: string
  first_run_done: boolean
}

export type SettingKey = keyof Settings

export interface ImportReport {
  added: number
  skipped: number
}

export interface Skipped {
  path: string
  reason: string
}

/** What became of each file handed to addFiles or pasteClipboard. */
export interface AddReport {
  /** Paths now in the library, or in the Screenshots folder on their way in. */
  added: string[]
  /** Ids of files that were already tracked. */
  existing: number[]
  skipped: Skipped[]
}

export interface AppError {
  code: 'NotFound' | 'FileMissing' | 'MoveFailed' | 'InvalidInput' | 'Io' | 'Db' | 'Image' | string
  message: string
}

export function isAppError(e: unknown): e is AppError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e
}

export function errorMessage(e: unknown): string {
  if (isAppError(e)) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}

/** A label used recently, with the destination it was last saved to. */
export interface RecentLabel {
  label: string
  destination_id: number
  destination_name: string
  uses: number
}

export interface DestinationCount { destination_id: number; count: number }
export interface TagCount { tag: string; count: number }

/** Numbers for the library sidebar. */
export interface LibraryCounts {
  total: number
  unlabeled: number
  missing: number
  by_destination: DestinationCount[]
  tags: TagCount[]
}

export interface Failed { id: number; reason: string }

export interface DeleteReport {
  deleted: number[]
  /** Files that went to the Recycle Bin; the rest were already missing. */
  trashed: number
  failed: Failed[]
  undo_token: number
}

export interface UndoReport {
  restored: number[]
  failed: Failed[]
}

export interface MoveReport {
  moved: number
  unchanged: number
  /** Metadata saved, file not moved yet (Retry move). */
  pending: number
  failed: Failed[]
  destination: Destination | null
}
