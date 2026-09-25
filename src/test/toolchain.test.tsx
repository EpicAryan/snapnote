import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('renders React under jsdom with jest-dom matchers', () => {
    render(<button>ok</button>)
    expect(screen.getByRole('button', { name: 'ok' })).toBeInTheDocument()
  })
})
