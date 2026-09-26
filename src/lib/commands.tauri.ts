import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { ask, open as openDialog } from '@tauri-apps/plugin-dialog'
import type { Commands, Events } from './commands'
import { DEFAULT_QUERY } from './types'

export const tauriCommands: Commands = {
  listScreenshots: (query) => invoke('list_screenshots', { query: { ...DEFAULT_QUERY, ...query } }),
  getScreenshot: (id) => invoke('get_screenshot', { id }),
  saveMetadata: (id, label, notes, choice) => invoke('save_metadata', { id, label, notes, choice }),
  retryMove: (id) => invoke('retry_move', { id }),
  thumbnailUrl: async (id) => convertFileSrc(await invoke<string>('get_thumbnail', { id })),
  imageDataUrl: (id) => invoke('get_image_data_url', { id }),
  openFile: (id) => invoke('open_file', { id }),
  revealFile: (id) => invoke('reveal_file', { id }),
  removeFromLibrary: (id) => invoke('remove_from_library', { id }),
  deleteFile: (id) => invoke('delete_file', { id }),
  copyScreenshot: (id) => invoke('copy_screenshot', { id }),
  pasteClipboard: () => invoke('paste_clipboard'),
  addFiles: (paths) => invoke('add_files', { paths }),
  reconcileNow: () => invoke('reconcile_now'),
  confirm: (message, title) => ask(message, { title: title ?? 'snapnote', kind: 'warning' }),

  listDestinations: () => invoke('list_destinations'),
  createDestination: (name, path) => invoke('create_destination', { name, path }),
  updateDestination: (id, name, path) => invoke('update_destination', { id, name, path }),
  deleteDestination: (id, reassignTo) => invoke('delete_destination', { id, reassignTo }),
  reorderDestinations: (ids) => invoke('reorder_destinations', { ids }),

  getSettings: () => invoke('get_settings'),
  setSetting: (key, value) => invoke('set_setting', { key, value }),
  detectWatchFolder: () => invoke('detect_watch_folder'),
  importExisting: () => invoke('import_existing'),
  clearThumbnailCache: () => invoke('clear_thumbnail_cache'),
  openDataFolder: () => invoke('open_data_folder'),

  pickFolder: async () => {
    const r = await openDialog({ directory: true, multiple: false, title: 'Choose a folder' })
    return typeof r === 'string' ? r : null
  },
  folderExists: (path) => invoke('folder_exists', { path }),
  createFolder: (path) => invoke('create_folder', { path }),

  hideToast: () => invoke('hide_toast'),
  openPopupFor: (id) => invoke('open_popup_for', { id }),
  hidePopup: () => invoke('hide_popup'),
  labelLastScreenshot: () => invoke('label_last_screenshot'),

  on: <E extends keyof Events>(event: E, handler: (payload: Events[E]) => void) => {
    // Explorer drag-and-drop arrives through the webview, not as a named event.
    if (event === 'files:drag' || event === 'files:drop') {
      const h = handler as (payload: Events['files:drag'] | Events['files:drop']) => void
      return getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload
        if (event === 'files:drag') {
          if (p.type === 'enter') h({ active: true })
          else if (p.type === 'leave' || p.type === 'drop') h({ active: false })
        } else if (p.type === 'drop') {
          h({ paths: p.paths })
        }
      })
    }
    return listen<Events[E]>(event, (e) => handler(e.payload))
  },
}
