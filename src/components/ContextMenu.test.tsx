import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContextMenu, type MenuItem } from './ContextMenu'

function setup() {
  const onClose = vi.fn()
  const picked: string[] = []
  const items: MenuItem[] = [
    { label: 'Open', shortcut: 'Enter', onSelect: () => picked.push('open') },
    { label: 'Copy', disabled: true, onSelect: () => picked.push('copy') },
    'separator',
    { label: 'Delete', danger: true, onSelect: () => picked.push('delete') },
  ]
  const anchor = document.createElement('button')
  anchor.textContent = 'anchor'
  document.body.appendChild(anchor)
  anchor.focus()
  render(<><ContextMenu x={10} y={20} items={items} onClose={onClose} /></>)
  return { onClose, picked, anchor }
}

describe('ContextMenu', () => {
  it('lists the items, disables what cannot be done, and focuses the first enabled item', () => {
    setup()
    const items = screen.getAllByRole('menuitem')
    expect(items.map((b) => b.textContent)).toEqual(['OpenEnter', 'Copy', 'Delete'])
    expect(items[1]).toBeDisabled()
    expect(items[0]).toHaveFocus()
  })

  it('arrows skip disabled items and wrap, Enter picks and closes, focus goes back to the anchor', () => {
    const { onClose, picked, anchor } = setup()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: /Open/ })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    fireEvent.keyDown(menu, { key: 'Enter' })
    expect(picked).toEqual(['delete'])
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(anchor).toHaveFocus()
  })

  it('clicking an item picks it; Escape and clicking outside close without picking', () => {
    const { onClose, picked } = setup()
    fireEvent.click(screen.getByRole('menuitem', { name: /Open/ }))
    expect(picked).toEqual(['open'])
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(3)
    expect(picked).toEqual(['open'])
  })
})
