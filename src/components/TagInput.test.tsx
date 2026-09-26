import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { TagInput } from './TagInput'

function Harness({ suggestions }: { suggestions?: string[] }) {
  const [tags, setTags] = useState<string[]>(['first'])
  return <><TagInput value={tags} onChange={setTags} suggestions={suggestions} /><output>{tags.join('|')}</output></>
}

describe('TagInput', () => {
  it('adds on Enter or comma with normalisation, removes with ✕ and Backspace', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Tags')
    fireEvent.change(input, { target: { value: 'Client X' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('status').textContent).toBe('first|client-x')
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: 'a, B' } })
    fireEvent.keyDown(input, { key: ',' })
    expect(screen.getByRole('status').textContent).toBe('first|client-x|a|b')
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag a' }))
    expect(screen.getByRole('status').textContent).toBe('first|client-x|b')
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(screen.getByRole('status').textContent).toBe('first|client-x')
  })

  it('commits pending text on blur and offers suggestions that are not chosen yet', () => {
    render(<Harness suggestions={['first', 'urgent']} />)
    expect(screen.queryByRole('button', { name: '+ first' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ urgent' }))
    expect(screen.getByRole('status').textContent).toBe('first|urgent')
    const input = screen.getByLabelText('Tags')
    fireEvent.change(input, { target: { value: 'later' } })
    fireEvent.blur(input)
    expect(screen.getByRole('status').textContent).toBe('first|urgent|later')
  })
})
