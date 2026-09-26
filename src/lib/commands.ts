import type {
  AddReport, Destination, DestinationChoice, ImportReport, ListQuery, SaveResult, Screenshot,
  ScreenshotCard, SettingKey, Settings,
} from './types'

export interface Events {
  'screenshot:new': { id: number }
  'screenshot:updated': { id: number }
  'screenshot:removed': { id: number }
  'toast:show': { id: number }
  'toast:hide': Record<string, never>
  'popup:open': { id: number }
  'import:progress': { done: number; total: number }
  'settings:changed': Record<string, never>
  'hotkey:error': { message: string }
  'library:view': { view: 'grid' | 'settings' }
  'library:refresh': Record<string, never>
  /** Files are being dragged over the window (true), or the drag left or ended (false). */
  'files:drag': { active: boolean }
  /** Files were dropped on the window. */
  'files:drop': { paths: string[] }
}

export type Unlisten = () => void

export interface Commands {
  listScreenshots(query: Partial<ListQuery>): Promise<ScreenshotCard[]>
  getScreenshot(id: number): Promise<Screenshot>
  saveMetadata(id: number, label: string, notes: string, choice: DestinationChoice): Promise<SaveResult>
  retryMove(id: number): Promise<SaveResult>
  thumbnailUrl(id: number): Promise<string>
  imageDataUrl(id: number): Promise<string>
  openFile(id: number): Promise<void>
  revealFile(id: number): Promise<void>
  removeFromLibrary(id: number): Promise<void>
  deleteFile(id: number): Promise<void>
  /** Puts the file and its pixels on the clipboard, so Explorer and image editors can both paste it. */
  copyScreenshot(id: number): Promise<void>
  /** Adds files from the clipboard, or saves a clipboard image into the Screenshots folder. */
  pasteClipboard(): Promise<AddReport>
  /** Adds image files (for example dropped from Explorer) to the library. */
  addFiles(paths: string[]): Promise<AddReport>
  /** Re-checks every tracked file on disk; resolves to how many rows changed status. */
  reconcileNow(): Promise<number>
  /** Native yes/no dialog. */
  confirm(message: string, title?: string): Promise<boolean>

  listDestinations(): Promise<Destination[]>
  createDestination(name: string, path: string): Promise<Destination>
  updateDestination(id: number, name: string, path: string): Promise<void>
  deleteDestination(id: number, reassignTo: number): Promise<void>
  reorderDestinations(ids: number[]): Promise<void>

  getSettings(): Promise<Settings>
  setSetting(key: SettingKey, value: string): Promise<void>
  detectWatchFolder(): Promise<string>
  importExisting(): Promise<ImportReport>
  clearThumbnailCache(): Promise<void>
  openDataFolder(): Promise<void>

  pickFolder(): Promise<string | null>
  folderExists(path: string): Promise<boolean>
  createFolder(path: string): Promise<void>

  hideToast(): Promise<void>
  openPopupFor(id: number): Promise<void>
  hidePopup(): Promise<void>
  labelLastScreenshot(): Promise<void>

  on<E extends keyof Events>(event: E, handler: (payload: Events[E]) => void): Promise<Unlisten>
}
