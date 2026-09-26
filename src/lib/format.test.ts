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
