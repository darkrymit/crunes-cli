import { describe, it, expect } from 'vitest'
import os from 'node:os'
import { getStorePath } from '../../src/store/index.js'

describe('test store isolation', () => {
  it('points the store at a temp dir, never the real home directory', () => {
    const store = getStorePath().replace(/\\/g, '/')
    expect(store.startsWith(os.homedir().replace(/\\/g, '/') + '/.crunes')).toBe(false)
    expect(process.env.CRUNES_STORE).toBeTruthy()
  })

  it('is restored even after a suite deletes the variable', () => {
    // Mimics the afterEach in cache/sqlite suites; the setup hook must undo it
    // before the next test, or rootless paths resolve into the real home store.
    delete process.env.CRUNES_STORE
    expect(process.env.CRUNES_STORE).toBeUndefined()
  })

  it('still points at the temp store in the following test', () => {
    expect(process.env.CRUNES_STORE).toBeTruthy()
    expect(getStorePath().replace(/\\/g, '/'))
      .not.toBe(os.homedir().replace(/\\/g, '/') + '/.crunes')
  })
})
