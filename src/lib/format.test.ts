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
