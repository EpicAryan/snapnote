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
  destination_id: number
  destination_name: string
  status: Status
  pending_move_to: number | null
}

export interface ListQuery {
  q: string
  destination_id: number | null
  unlabeled_only: boolean
  sort: Sort
  limit: number
  offset: number
}

export const DEFAULT_QUERY: ListQuery = {
  q: '',
  destination_id: null,
  unlabeled_only: false,
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
