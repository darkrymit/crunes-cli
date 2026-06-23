import { describe, it, expect, vi } from 'vitest'
import { createUtils } from '../../../src/rune/api/index.js'

describe('notify namespace — wired into createUtils', () => {
  it('notify.send exists on the utils object', () => {
    const { utils } = createUtils('/tmp', () => {})
    expect(typeof utils.notify.send).toBe('function')
  })

  it('notify.send throws PermissionError when not allowed', async () => {
    const check = (token) => { throw new Error(`PermissionError: '${token}'`) }
    const { utils } = createUtils('/tmp', check)
    await expect(utils.notify.send('T', 'M')).rejects.toThrow('PermissionError')
  })
})
