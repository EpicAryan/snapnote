import { describe, expect, it } from 'vitest'
import { displayName, formatDate } from './format'

describe('format', () => {
  it('formatDate renders day and short month', () => {
    expect(formatDate('2026-09-26T01:57:47')).toBe('26 Sep 2026')
    expect(formatDate('garbage')).toBe('garbage')
  })
  it('displayName prefers label over original filename', () => {
    expect(displayName({ label: 'Invoice', original_name: 'x.png' })).toBe('Invoice')
    expect(displayName({ label: '', original_name: 'x.png' })).toBe('x.png')
  })
})

describe('describeAdd', () => {
  it('phrases a paste or drop result in one line', async () => {
    const { describeAdd } = await import('./format')
    expect(describeAdd({ added: ['C:\\S\\a.png'], existing: [], skipped: [] })).toBe('Added a.png')
    expect(describeAdd({ added: ['C:\\S\\a.png', 'C:\\S\\b.png'], existing: [3], skipped: [{ path: 'x.txt', reason: 'not an image' }] }))
      .toBe('Added 2 images · 1 already in the library · skipped x.txt (not an image)')
    expect(describeAdd({ added: [], existing: [], skipped: [{ path: 'a', reason: 'r' }, { path: 'b', reason: 'r' }] })).toBe('skipped 2 files')
    expect(describeAdd({ added: [], existing: [], skipped: [] })).toBe('Nothing to add')
  })
})

describe('tags and reports', () => {
  it('normalizeTags mirrors the Rust rules', async () => {
    const { normalizeTags } = await import('./format')
    expect(normalizeTags(['  Client X ', 'client-x', 'Invoice!', '', 'a_b.c'])).toEqual(['client-x', 'invoice', 'a_b.c'])
    expect(normalizeTags(['x'.repeat(100)])[0]).toHaveLength(40)
  })
  it('describes delete, undo and move results', async () => {
    const { describeDelete, describeMove, describeUndo } = await import('./format')
    expect(describeDelete({ deleted: [1, 2, 3], trashed: 2, failed: [], undo_token: 1 })).toBe('Moved 2 screenshots to the Recycle Bin · removed 1 missing entry')
    expect(describeDelete({ deleted: [], trashed: 0, failed: [{ id: 1, reason: 'locked' }], undo_token: 1 })).toBe('1 failed: locked')
    expect(describeUndo({ restored: [1], failed: [] })).toBe('Restored 1 screenshot')
    const dest = { id: 2, name: 'Work', path: 'D:\\Work', sort_order: 0, is_default: false }
    expect(describeMove({ moved: 2, unchanged: 1, pending: 1, failed: [], destination: dest })).toBe('Moved 2 to Work · 1 already there · 1 could not be moved yet (use Retry move)')
  })
})
