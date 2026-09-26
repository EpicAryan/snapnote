import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebounced } from './useDebounced'

describe('useDebounced', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('emits the latest value after the delay', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 150), { initialProps: { v: 'a' } })
    rerender({ v: 'ab' })
    rerender({ v: 'abc' })
    expect(result.current).toBe('a')
    act(() => { vi.advanceTimersByTime(160) })
    expect(result.current).toBe('abc')
  })
})
