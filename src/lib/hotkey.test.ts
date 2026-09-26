import { describe, expect, it } from 'vitest'
import { isValidHotkey, normalizeHotkey } from './hotkey'

describe('hotkey', () => {
  it('accepts modifier+key combos and normalises casing/spacing', () => {
    expect(normalizeHotkey(' ctrl + shift + l ')).toBe('Ctrl+Shift+L')
    expect(normalizeHotkey('ALT+F9')).toBe('Alt+F9')
    expect(isValidHotkey('Ctrl+Shift+L')).toBe(true)
    expect(isValidHotkey('Ctrl+Alt+Space')).toBe(true)
  })
  it('rejects combos without a modifier or without a key', () => {
    expect(isValidHotkey('L')).toBe(false)
    expect(isValidHotkey('Ctrl+')).toBe(false)
    expect(isValidHotkey('Shift+L')).toBe(false) // Shift alone would swallow typing
    expect(isValidHotkey('')).toBe(false)
  })
})
