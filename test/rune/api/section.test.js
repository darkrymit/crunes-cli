import { describe, it, expect } from 'vitest'
import { createSectionUtils } from '../../../src/rune/api/index.js'

describe('section.create', () => {
  it('returns correct shape with required fields', () => {
    const section = createSectionUtils(null)
    const s = section.create('my-section', { type: 'markdown', content: 'hello' })
    expect(s).toEqual({ name: 'my-section', title: undefined, attrs: {}, data: { type: 'markdown', content: 'hello' } })
  })

  it('includes title and attrs when provided', () => {
    const section = createSectionUtils(null)
    const s = section.create('my-section', { type: 'markdown', content: '' }, { title: 'My Title', attrs: { foo: 'bar' } })
    expect(s.title).toBe('My Title')
    expect(s.attrs).toEqual({ foo: 'bar' })
  })
})

describe('section.selected', () => {
  it('returns null when no sections requested', () => {
    const section = createSectionUtils(null)
    expect(section.selected()).toBeNull()
  })

  it('returns requested pattern array', () => {
    const section = createSectionUtils(['api-*', 'errors'])
    expect(section.selected()).toEqual(['api-*', 'errors'])
  })
})

describe('section.match', () => {
  it('returns true when patterns is null', () => {
    const section = createSectionUtils(null)
    expect(section.match('anything')).toBe(true)
  })

  it('returns true when patterns is undefined', () => {
    const section = createSectionUtils(undefined)
    expect(section.match('anything')).toBe(true)
  })

  it('matches exact name', () => {
    const section = createSectionUtils(['endpoints'])
    expect(section.match('endpoints')).toBe(true)
    expect(section.match('errors')).toBe(false)
  })

  it('matches glob pattern', () => {
    const section = createSectionUtils(['api-*'])
    expect(section.match('api-auth')).toBe(true)
    expect(section.match('api-users')).toBe(true)
    expect(section.match('errors')).toBe(false)
  })

  it('wildcard matches any name', () => {
    const section = createSectionUtils(['*'])
    expect(section.match('anything')).toBe(true)
  })

  it('matches when any pattern in array matches', () => {
    const section = createSectionUtils(['api-*', 'errors'])
    expect(section.match('api-auth')).toBe(true)
    expect(section.match('errors')).toBe(true)
    expect(section.match('other')).toBe(false)
  })

  it('allows overriding internal patterns', () => {
    const section = createSectionUtils(['endpoints'])
    expect(section.match('errors', ['errors'])).toBe(true)
    expect(section.match('endpoints', ['errors'])).toBe(false)
  })
})
