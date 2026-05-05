import { describe, it, expect } from 'vitest'
import { node, format } from '../../../src/rune/api/tree.js'

describe('format (tree style)', () => {
  it('renders children with tree connectors', () => {
    const root = node('root', 'Root', [
      node('a', 'First'),
      node('b', 'Last'),
    ])
    const out = format(root)
    expect(out).toContain('├──')
    expect(out).toContain('└──')
  })

  it('matches snapshot', () => {
    const root = node('root', 'Root', [
      node('src', 'Source files', [
        node('index', 'Entry point'),
        node('utils', 'Utilities'),
      ]),
      node('dist', 'Output'),
    ])
    expect(format(root)).toMatchSnapshot()
  })
})

describe('format (list style)', () => {
  it('renders nodes as markdown bold items', () => {
    const root = node('root', 'Root', [node('child', 'A child')])
    const out = format(root, { style: 'list' })
    expect(out).toContain('**root**')
    expect(out).toContain('**child**')
  })

  it('indents children by two spaces per depth level', () => {
    const root = node('root', 'Root', [node('child', 'Child')])
    const out = format(root, { style: 'list' })
    const lines = out.split('\n')
    const childLine = lines.find(l => l.includes('child'))
    expect(childLine).toMatch(/^  /)
  })

  it('respects custom bullet character', () => {
    const root = node('root', 'Root')
    const out = format(root, { style: 'list', bullet: '*' })
    expect(out).toContain('* **root**')
  })
})
