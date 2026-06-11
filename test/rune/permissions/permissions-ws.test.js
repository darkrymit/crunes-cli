import { describe, it, expect } from 'vitest'
import { matchWsPermission } from '../../../src/rune/permissions/permissions-ws.js'

describe('matchWsPermission', () => {
  it('matches exact ws URL with ws: prefix on pattern', () => {
    expect(matchWsPermission(
      'ws://localhost:3000/chat',
      'ws://localhost:3000/**',
    )).toBe(true)
  })

  it('matches wss URL', () => {
    expect(matchWsPermission(
      'wss://api.example.com/stream',
      'wss://api.example.com/**',
    )).toBe(true)
  })

  it('rejects URL not matching pattern', () => {
    expect(matchWsPermission(
      'ws://evil.com/data',
      'ws://localhost:3000/**',
    )).toBe(false)
  })

  it('wildcard ws:** matches any URL', () => {
    expect(matchWsPermission(
      'ws://localhost:9229/json',
      '**',
    )).toBe(true)
  })

  it('* matches single path segment only', () => {
    expect(matchWsPermission(
      'ws://localhost:3000/chat',
      'ws://localhost:3000/*',
    )).toBe(true)
    expect(matchWsPermission(
      'ws://localhost:3000/chat/room/1',
      'ws://localhost:3000/*',
    )).toBe(false)
  })

  it('** matches multiple path segments', () => {
    expect(matchWsPermission(
      'ws://localhost:3000/chat/room/1',
      'ws://localhost:3000/**',
    )).toBe(true)
  })

})
