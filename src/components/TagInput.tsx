import { useRef, useState, type KeyboardEvent } from 'react'
import { normalizeTag } from '../lib/format'

interface Props {
  value: string[]
  onChange(tags: string[]): void
  suggestions?: string[]
  disabled?: boolean
  placeholder?: string
  /** Accessible name of the text field. */
  label?: string
}

/** Chips plus a text field. Enter, comma or Tab adds; Backspace on an empty field removes the last one. */
export function TagInput({ value, onChange, suggestions = [], disabled, placeholder = 'Add tag…', label = 'Tags' }: Props) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const offered = suggestions.filter((s) => !value.includes(s)).slice(0, 8)

  const commit = (raw: string) => {
    const parts = raw.split(',').map(normalizeTag).filter(Boolean)
    setText('')
    if (!parts.length) return
    const next = [...value]
    for (const p of parts) if (!next.includes(p)) next.push(p)
    if (next.length !== value.length) onChange(next)
  }
  const remove = (tag: string) => onChange(value.filter((t) => t !== tag))
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && text.trim()) {
      e.preventDefault()
      e.stopPropagation()
      commit(text)
      return
    }
    if (e.key === 'Backspace' && !text && value.length) {
      e.preventDefault()
      remove(value[value.length - 1])
    }
  }

  return (
    <div>
    <div className="flex flex-wrap items-center gap-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1" onClick={() => inputRef.current?.focus()}>
      {value.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded bg-sky-900/70 px-1.5 text-xs text-sky-100">
          #{t}
          {!disabled && (
            <button type="button" aria-label={`Remove tag ${t}`} className="text-sky-300 hover:text-white" onClick={(e) => { e.stopPropagation(); remove(t) }}>✕</button>
          )}
        </span>
      ))}
      <input ref={inputRef} aria-label={label} value={text} disabled={disabled} placeholder={value.length ? '' : placeholder}
        onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} onBlur={() => { if (text.trim()) commit(text) }}
        className="min-w-16 flex-1 bg-transparent text-sm outline-none" />
    </div>
    {offered.length > 0 && !disabled && (
      <div className="mt-1 flex flex-wrap gap-1">
        {offered.map((s) => (
          <button key={s} type="button" className="rounded border border-neutral-700 px-1 text-[11px] text-neutral-400 hover:border-neutral-500 hover:text-neutral-100" onClick={() => onChange([...value, s])}>+ {s}</button>
        ))}
      </div>
    )}
    </div>
  )
}
