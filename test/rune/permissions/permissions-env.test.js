import { describe, it, expect } from 'vitest'
import { parseEnvPattern, matchEnvPermission } from '../../../src/rune/permissions/permissions-env.js'
import { makePermissionChecker, PermissionError } from '../../../src/rune/permissions/permissions.js'

describe('parseEnvPattern', () => {
  it('splits source and key pattern on last colon', () => {
    expect(parseEnvPattern('env.read:process:GITHUB_*')).toEqual({
      source: 'process',
      keyPattern: 'GITHUB_*',
    })
  })

  it('handles dotfile source names (.env.local)', () => {
    expect(parseEnvPattern('env.read:.env.local:API_*')).toEqual({
      source: '.env.local',
      keyPattern: 'API_*',
    })
  })

  it('handles wildcard key pattern', () => {
    expect(parseEnvPattern('env.read:process:*')).toEqual({
      source: 'process',
      keyPattern: '*',
    })
  })
})

describe('matchEnvPermission', () => {
  it('matches when source and key both match', () => {
    expect(matchEnvPermission('process:GITHUB_TOKEN', 'env.read:process:GITHUB_*')).toBe(true)
  })

  it('matches .env source', () => {
    expect(matchEnvPermission('.env:API_KEY', 'env.read:.env:API_*')).toBe(true)
  })

  it('rejects when source does not match', () => {
    expect(matchEnvPermission('.env.local:API_KEY', 'env.read:.env:API_*')).toBe(false)
  })

  it('rejects when key does not match glob', () => {
    expect(matchEnvPermission('process:DB_HOST', 'env.read:process:API_*')).toBe(false)
  })

  it('wildcard key pattern matches any key', () => {
    expect(matchEnvPermission('process:ANY_KEY', 'env.read:process:*')).toBe(true)
  })

  it('supports env.read:* wildcard source matching', () => {
    expect(matchEnvPermission('process:API_KEY', 'env.read:*')).toBe(true)
    expect(matchEnvPermission('.env:API_KEY', 'env.read:*')).toBe(true)
  })

  it('supports env.read:KEY_NAME wildcard source matching for specific key', () => {
    expect(matchEnvPermission('process:TOKEN', 'env.read:TOKEN')).toBe(true)
    expect(matchEnvPermission('.env:TOKEN', 'env.read:TOKEN')).toBe(true)
    expect(matchEnvPermission('.env:OTHER', 'env.read:TOKEN')).toBe(false)
  })
})

describe('makePermissionChecker — env.read capability', () => {
  it('allows a matching env permission', () => {
    const check = makePermissionChecker({ allow: ['env.read:process:TOKEN'], deny: [] })
    expect(() => check('env.read', 'process:TOKEN')).not.toThrow()
  })

  it('throws PermissionError for unlisted source', () => {
    const check = makePermissionChecker({ allow: ['env.read:process:TOKEN'], deny: [] })
    expect(() => check('env.read', '.env:TOKEN')).toThrow(PermissionError)
  })

  it('throws PermissionError for unlisted key', () => {
    const check = makePermissionChecker({ allow: ['env.read:process:TOKEN'], deny: [] })
    expect(() => check('env.read', 'process:OTHER')).toThrow(PermissionError)
  })

  it('throws PermissionError when source:key is in deny list', () => {
    const check = makePermissionChecker({
      allow: ['env.read:process:SECRET'],
      deny:  ['env.read:process:SECRET'],
    })
    expect(() => check('env.read', 'process:SECRET')).toThrow(PermissionError)
  })

  it('PermissionError carries env.read capability and source:key value', () => {
    const check = makePermissionChecker({ allow: [], deny: [] })
    let err
    try { check('env.read', 'process:TOKEN') } catch (e) { err = e }
    expect(err).toBeInstanceOf(PermissionError)
    expect(err.capability).toBe('env.read')
    expect(err.value).toBe('process:TOKEN')
  })
})
