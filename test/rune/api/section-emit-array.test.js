import { describe, it, expect } from 'vitest'

describe('section emit array normalisation', () => {
  it('wraps single section in array', () => {
    const collected = []
    const emitFn = (sectionOrArray) => {
      const items = Array.isArray(sectionOrArray) ? sectionOrArray : [sectionOrArray]
      for (const s of items) collected.push(s)
    }
    emitFn({ name: 'a', data: {} })
    expect(collected).toHaveLength(1)
    expect(collected[0].name).toBe('a')
  })

  it('emits all items when given an array', () => {
    const collected = []
    const emitFn = (sectionOrArray) => {
      const items = Array.isArray(sectionOrArray) ? sectionOrArray : [sectionOrArray]
      for (const s of items) collected.push(s)
    }
    emitFn([{ name: 'a', data: {} }, { name: 'b', data: {} }])
    expect(collected).toHaveLength(2)
    expect(collected[1].name).toBe('b')
  })
})
