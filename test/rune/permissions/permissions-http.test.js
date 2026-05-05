import { describe, it, expect } from 'vitest'
import { matchFetchPermission } from '../../../src/rune/permissions/permissions-http.js'
import { makePermissionChecker, PermissionError } from '../../../src/rune/permissions/permissions.js'

describe('matchFetchPermission', () => {
  it('matches exact method and URL', () => {
    expect(matchFetchPermission(
      'GET:https://api.github.com/issues',
      'fetch:GET:https://api.github.com/issues',
    )).toBe(true)
  })

  it('wildcard method matches any method', () => {
    expect(matchFetchPermission(
      'POST:https://api.github.com/issues',
      'fetch:*:https://api.github.com/*',
    )).toBe(true)
  })

  it('rejects wrong method', () => {
    expect(matchFetchPermission(
      'POST:https://api.github.com/issues',
      'fetch:GET:https://api.github.com/*',
    )).toBe(false)
  })

  it('method match is case-insensitive', () => {
    expect(matchFetchPermission(
      'get:https://api.github.com/issues',
      'fetch:GET:https://api.github.com/*',
    )).toBe(true)
  })

  it('* matches a single URL segment', () => {
    expect(matchFetchPermission(
      'GET:https://api.github.com/issues',
      'fetch:GET:https://api.github.com/*',
    )).toBe(true)
    expect(matchFetchPermission(
      'GET:https://api.github.com/rest/api',
      'fetch:GET:https://api.github.com/*',
    )).toBe(false)
  })

  it('** matches multiple URL segments', () => {
    expect(matchFetchPermission(
      'GET:https://api.github.com/rest/api/2/issues',
      'fetch:GET:https://api.github.com/**',
    )).toBe(true)
  })

  it('rejects URL that does not match pattern', () => {
    expect(matchFetchPermission(
      'GET:https://evil.com/data',
      'fetch:GET:https://api.github.com/*',
    )).toBe(false)
  })

  it('returns false when value has no method prefix', () => {
    expect(matchFetchPermission(
      'https://api.github.com/issues',
      'fetch:GET:https://api.github.com/*',
    )).toBe(false)
  })
})

describe('makePermissionChecker — fetch capability', () => {
  it('allows a matching fetch permission', () => {
    const check = makePermissionChecker({ allow: ['fetch:GET:https://api.github.com/*'], deny: [] })
    expect(() => check('fetch', 'GET:https://api.github.com/issues')).not.toThrow()
  })

  it('throws PermissionError for unlisted fetch URL', () => {
    const check = makePermissionChecker({ allow: ['fetch:GET:https://api.github.com/*'], deny: [] })
    expect(() => check('fetch', 'GET:https://evil.com/data')).toThrow(PermissionError)
  })

  it('throws PermissionError when fetch URL is in deny list', () => {
    const check = makePermissionChecker({
      allow: ['fetch:GET:https://api.github.com/**'],
      deny:  ['fetch:GET:https://api.github.com/admin/**'],
    })
    expect(() => check('fetch', 'GET:https://api.github.com/admin/users')).toThrow(PermissionError)
  })

  it('PermissionError carries fetch capability and METHOD:url value', () => {
    const check = makePermissionChecker({ allow: [], deny: [] })
    let err
    try { check('fetch', 'GET:https://example.com') } catch (e) { err = e }
    expect(err).toBeInstanceOf(PermissionError)
    expect(err.capability).toBe('fetch')
    expect(err.value).toBe('GET:https://example.com')
  })
})
