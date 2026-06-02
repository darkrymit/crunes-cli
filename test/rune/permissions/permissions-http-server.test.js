import { describe, it, expect } from 'vitest'
import { matchHttpServerPermission, isLoopbackHost } from '../../../src/rune/permissions/permissions-http-server.js'

describe('isLoopbackHost', () => {
  it('recognizes 127.0.0.1 as loopback', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
  })
  it('recognizes localhost as loopback', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
  })
  it('recognizes ::1 as loopback', () => {
    expect(isLoopbackHost('::1')).toBe(true)
  })
  it('does not recognize 0.0.0.0 as loopback', () => {
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
  })
  it('does not recognize external IP as loopback', () => {
    expect(isLoopbackHost('192.168.1.1')).toBe(false)
  })
})

describe('matchHttpServerPermission', () => {
  it('matches exact host and port', () => {
    expect(matchHttpServerPermission('0.0.0.0:3000', 'http.server:0.0.0.0:3000')).toBe(true)
  })
  it('rejects wrong port', () => {
    expect(matchHttpServerPermission('0.0.0.0:4000', 'http.server:0.0.0.0:3000')).toBe(false)
  })
  it('wildcard port matches any port', () => {
    expect(matchHttpServerPermission('0.0.0.0:9999', 'http.server:0.0.0.0:*')).toBe(true)
  })
  it('matches port 0 explicitly', () => {
    expect(matchHttpServerPermission('0.0.0.0:0', 'http.server:0.0.0.0:0')).toBe(true)
  })
  it('rejects wrong host', () => {
    expect(matchHttpServerPermission('192.168.1.1:3000', 'http.server:0.0.0.0:3000')).toBe(false)
  })
  it('pattern without http.server: prefix still matches', () => {
    expect(matchHttpServerPermission('0.0.0.0:3000', '0.0.0.0:3000')).toBe(true)
  })
})
