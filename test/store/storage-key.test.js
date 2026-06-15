import { describe, it, expect } from 'vitest'
import { storageKey } from '../../src/store/storage-key.js'

describe('storageKey', () => {
  const PID  = 'myproj-abc12345'
  const PLID = 'my-plugin@1.0.0'

  it('global-plugin: deterministic for same inputs', () => {
    const a = storageKey('global-plugin', { pluginId: PLID, name: 'bucket' })
    const b = storageKey('global-plugin', { pluginId: PLID, name: 'bucket' })
    expect(a).toBe(b)
  })

  it('global-plugin: name prefix appears in key', () => {
    expect(storageKey('global-plugin', { pluginId: PLID, name: 'mybucket' })).toMatch(/^mybucket-/)
  })

  it('local: deterministic for same inputs', () => {
    const a = storageKey('local', { projectId: PID, name: 'cache' })
    const b = storageKey('local', { projectId: PID, name: 'cache' })
    expect(a).toBe(b)
  })

  it('local-plugin: deterministic for same inputs', () => {
    const a = storageKey('local-plugin', { projectId: PID, pluginId: PLID, name: 'data' })
    const b = storageKey('local-plugin', { projectId: PID, pluginId: PLID, name: 'data' })
    expect(a).toBe(b)
  })

  it('different type produces different key for same other params', () => {
    const globalPlugin = storageKey('global-plugin', { pluginId: PLID, name: 'bucket' })
    const local        = storageKey('local',         { projectId: PID, name: 'bucket' })
    expect(globalPlugin).not.toBe(local)
  })

  it('different projectId produces different key', () => {
    const a = storageKey('local', { projectId: 'proj-aaaa1111', name: 'bucket' })
    const b = storageKey('local', { projectId: 'proj-bbbb2222', name: 'bucket' })
    expect(a).not.toBe(b)
  })

  it('different pluginId produces different key', () => {
    const a = storageKey('global-plugin', { pluginId: 'plugin-a@1.0', name: 'bucket' })
    const b = storageKey('global-plugin', { pluginId: 'plugin-b@1.0', name: 'bucket' })
    expect(a).not.toBe(b)
  })

  it('different name produces different key', () => {
    const a = storageKey('local', { projectId: PID, name: 'alpha' })
    const b = storageKey('local', { projectId: PID, name: 'beta' })
    expect(a).not.toBe(b)
  })

  it('throws for unknown type', () => {
    expect(() => storageKey('unknown-type', { projectId: PID, name: 'x' })).toThrow('Unknown storage key type')
  })

  it('key format is name-hash8chars', () => {
    const key = storageKey('local', { projectId: PID, name: 'myname' })
    expect(key).toMatch(/^myname-[0-9a-f]{8}$/)
  })
})
