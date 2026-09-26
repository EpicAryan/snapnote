import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Destination } from '../lib/types'
import { DestinationSelect } from './DestinationSelect'

const dests: Destination[] = [
  { id: 1, name: 'Default', path: 'C:\\S', sort_order: -1, is_default: true },
  { id: 2, name: 'Embee', path: 'D:\\E', sort_order: 0, is_default: false },
]

describe('DestinationSelect', () => {
  it('lists destinations plus Browse and reports existing choice', () => {
    const onChange = vi.fn()
    render(<DestinationSelect destinations={dests} value={{ kind: 'existing', id: 1 }} onChange={onChange} onBrowse={async () => null} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['Default (Screenshots folder)', 'Embee', 'Browse…'])
    fireEvent.change(select, { target: { value: '2' } })
    expect(onChange).toHaveBeenCalledWith({ kind: 'existing', id: 2 })
  })

  it('Browse calls onBrowse and reports a browse choice showing the picked path', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<DestinationSelect destinations={dests} value={{ kind: 'existing', id: 1 }} onChange={onChange} onBrowse={async () => 'D:\\ClientX'} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__browse' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ kind: 'browse', path: 'D:\\ClientX' }))
    rerender(<DestinationSelect destinations={dests} value={{ kind: 'browse', path: 'D:\\ClientX' }} onChange={onChange} onBrowse={async () => null} />)
    expect((screen.getByRole('combobox') as HTMLSelectElement).selectedOptions[0].text).toBe('D:\\ClientX')
  })

  it('cancelled Browse keeps the previous value', async () => {
    const onChange = vi.fn()
    render(<DestinationSelect destinations={dests} value={{ kind: 'existing', id: 2 }} onChange={onChange} onBrowse={async () => null} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__browse' } })
    await waitFor(() => expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('2'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
