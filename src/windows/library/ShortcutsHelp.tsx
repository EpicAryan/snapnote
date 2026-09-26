import { Fragment, useEffect, useRef, type KeyboardEvent } from 'react'

const ROWS: Array<[string, string]> = [
  ['↑ ↓ ← →', 'Move the selection'],
  ['Home / End', 'First / last screenshot'],
  ['Page Up / Page Down', 'Jump a few rows'],
  ['Ctrl+A', 'Select everything'],
  ['Shift+arrows / Shift+click', 'Extend the selection'],
  ['Ctrl+click / Ctrl+Space', 'Add or remove one from the selection'],
  ['Enter', 'Open in the default app'],
  ['Space', 'Preview'],
  ['F2', 'Edit the label and notes'],
  ['Delete', 'Delete (asks first)'],
  ['Ctrl+C', 'Copy the file and its image'],
  ['Ctrl+V', 'Paste an image, or files copied in Explorer'],
  ['Shift+F10 / Menu key', 'Actions for the selected screenshot'],
  ['/ or Ctrl+F', 'Search'],
  ['Esc', 'Close the details pane, menu or preview'],
  ['?', 'This list'],
]

export function ShortcutsHelp({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); onClose() }
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div ref={ref} role="dialog" aria-label="Keyboard shortcuts" aria-modal="true" tabIndex={-1} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()}
        className="w-[28rem] max-w-[90vw] rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-sm shadow-xl outline-none">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-semibold">Keyboard shortcuts</span>
          <button aria-label="Close shortcuts" className="rounded px-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100" onClick={onClose}>✕</button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {ROWS.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="whitespace-nowrap font-mono text-xs text-sky-300">{k}</dt>
              <dd className="text-neutral-300">{v}</dd>
            </Fragment>
          ))}
        </dl>
        <p className="mt-3 text-xs text-neutral-500">Right-click a card for the same actions. Drag images from Explorer into this window to add them.</p>
      </div>
    </div>
  )
}
