import { describe, it, expect } from 'vitest'
import { render, renderSection, formatSection } from '../../src/shared/render.js'

describe('render', () => {
  it('returns null for null input', () => {
    expect(render(null)).toBeNull()
  })

  it('returns markdown content string', () => {
    expect(render({ type: 'markdown', content: 'hello' })).toBe('hello')
  })

  it('renders a tree node to string', () => {
    const root = { name: 'root', description: 'Root', children: [] }
    const out = render({ type: 'tree', root })
    expect(out).toContain('root')
    expect(out).toContain('Root')
  })

  it('returns null for unknown type', () => {
    expect(render({ type: 'unknown' })).toBeNull()
  })
})

describe('renderSection', () => {
  it('uses title as h2 when present', () => {
    const out = renderSection({ title: 'My Title', name: 'my-name', data: { type: 'markdown', content: 'x' } })
    expect(out).toContain('## My Title')
    expect(out).not.toContain('## my-name')
  })

  it('falls back to name when no title', () => {
    const out = renderSection({ name: 'my-section', data: { type: 'markdown', content: 'x' } })
    expect(out).toContain('## my-section')
  })

  it('uses (no title) when neither title nor name present', () => {
    const out = renderSection({ data: { type: 'markdown', content: 'x' } })
    expect(out).toContain('## (no title)')
  })

  it('renders attrs as [key: value] pairs', () => {
    const out = renderSection({
      name: 's',
      attrs: { lang: 'en', version: '2' },
      data: { type: 'markdown', content: 'x' },
    })
    expect(out).toContain('[lang: en]')
    expect(out).toContain('[version: 2]')
  })

  it('omits attrs line when attrs is empty', () => {
    const out = renderSection({ name: 's', attrs: {}, data: { type: 'markdown', content: 'x' } })
    expect(out).not.toContain('[')
  })

  it('renders markdown content inline without fence', () => {
    const out = renderSection({ name: 's', data: { type: 'markdown', content: 'hello' } })
    expect(out).toContain('hello')
    expect(out).not.toContain('```')
  })

  it('renders tree content inline without fence', () => {
    const root = { name: 'root', description: 'Root', children: [] }
    const out = renderSection({ name: 's', data: { type: 'tree', root } })
    expect(out).not.toContain('```')
    expect(out).toContain('root')
  })

  it('still returns header even when data renders to nothing', () => {
    expect(renderSection({ data: null })).toContain('## (no title)')
  })

  it('matches snapshot for a full markdown section', () => {
    expect(renderSection({
      title: 'Overview',
      name: 'overview',
      attrs: { generated: 'true' },
      data: { type: 'markdown', content: '**Hello world**' },
    })).toMatchSnapshot()
  })
})

describe('formatSection', () => {
  it('produces [rune:section] prefix with name', () => {
    const out = formatSection({ name: 'result', data: { type: 'markdown', content: '| a | b |' } }, 'my-rune')
    expect(out).toBe('[my-rune:section] result\n| a | b |')
  })

  it('uses title over name when present', () => {
    const out = formatSection({ title: 'My Title', name: 'result', data: { type: 'markdown', content: 'x' } }, 'r')
    expect(out).toContain('[r:section] My Title')
  })

  it('appends attrs inline after name', () => {
    const out = formatSection({
      name: 'result',
      attrs: { rowCount: '5' },
      data: { type: 'markdown', content: 'table' },
    }, 'sqlite-shell')
    expect(out).toBe('[sqlite-shell:section] result [rowCount: 5]\ntable')
  })

  it('omits attrs when empty', () => {
    const out = formatSection({ name: 'result', attrs: {}, data: { type: 'markdown', content: 'x' } }, 'r')
    expect(out).toBe('[r:section] result\nx')
  })

  it('omits content line when data renders to nothing', () => {
    const out = formatSection({ name: 'result', data: null }, 'r')
    expect(out).toBe('[r:section] result')
  })

  it('renders tree content without fence', () => {
    const root = { name: 'root', description: 'Root node', children: [] }
    const out = formatSection({ name: 'tree-sec', data: { type: 'tree', root } }, 'r')
    expect(out).toContain('[r:section] tree-sec')
    expect(out).toContain('root')
    expect(out).not.toContain('```')
  })
})
