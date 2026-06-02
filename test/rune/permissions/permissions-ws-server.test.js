import { describe, it, expect } from 'vitest'
import { matchWsServerPermission } from '../../../src/rune/permissions/permissions-ws.js'

describe('matchWsServerPermission', () => {
  it('matches exact host and port without path', () => {
    expect(matchWsServerPermission('0.0.0.0:8080', 'ws.server:0.0.0.0:8080')).toBe(true)
  })
  it('rejects wrong port', () => {
    expect(matchWsServerPermission('0.0.0.0:9090', 'ws.server:0.0.0.0:8080')).toBe(false)
  })
  it('wildcard port matches any port', () => {
    expect(matchWsServerPermission('0.0.0.0:9999', 'ws.server:0.0.0.0:*')).toBe(true)
  })
  it('matches with path', () => {
    expect(matchWsServerPermission('0.0.0.0:8080:/chat', 'ws.server:0.0.0.0:8080:/chat')).toBe(true)
  })
  it('rejects wrong path', () => {
    expect(matchWsServerPermission('0.0.0.0:8080:/chat', 'ws.server:0.0.0.0:8080:/other')).toBe(false)
  })
  it('pattern without path does not match value with path', () => {
    expect(matchWsServerPermission('0.0.0.0:8080:/chat', 'ws.server:0.0.0.0:8080')).toBe(false)
  })
  it('wildcard path matches any path', () => {
    expect(matchWsServerPermission('0.0.0.0:8080:/chat', 'ws.server:0.0.0.0:8080:*')).toBe(true)
  })
})
