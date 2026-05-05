import { describe, it, expect } from 'vitest'
import * as md from '../../../src/rune/api/md.js'

describe('headings', () => {
  it('h1 produces # heading', () => expect(md.h1('Title')).toBe('# Title\n'))
  it('h2 produces ## heading', () => expect(md.h2('Title')).toBe('## Title\n'))
  it('h3 produces ### heading', () => expect(md.h3('Title')).toBe('### Title\n'))
})

describe('inline formatting', () => {
  it('bold wraps in **', () => expect(md.bold('x')).toBe('**x**'))
  it('italic wraps in _', () => expect(md.italic('x')).toBe('_x_'))
  it('code wraps in backticks', () => expect(md.code('x')).toBe('`x`'))
})

describe('codeBlock', () => {
  it('wraps content in triple backticks', () => {
    expect(md.codeBlock('const x = 1')).toBe('```\nconst x = 1\n```\n')
  })

  it('includes language when provided', () => {
    expect(md.codeBlock('const x = 1', 'js')).toBe('```js\nconst x = 1\n```\n')
  })
})

describe('ul', () => {
  it('produces a bullet list', () => {
    expect(md.ul(['a', 'b', 'c'])).toBe('- a\n- b\n- c\n')
  })

  it('single item has no trailing separator issues', () => {
    expect(md.ul(['only'])).toBe('- only\n')
  })
})

describe('ol', () => {
  it('produces a numbered list', () => {
    expect(md.ol(['first', 'second'])).toBe('1. first\n2. second\n')
  })
})

describe('link', () => {
  it('produces markdown link syntax', () => {
    expect(md.link('Example', 'https://example.com')).toBe('[Example](https://example.com)')
  })
})

describe('table', () => {
  it('produces header, separator, and rows', () => {
    const out = md.table(['Name', 'Version'], [['react', '18.0.0'], ['lodash', '4.17.21']])
    expect(out).toContain('| Name | Version |')
    expect(out).toContain('| --- | --- |')
    expect(out).toContain('| react | 18.0.0 |')
    expect(out).toContain('| lodash | 4.17.21 |')
  })
})
