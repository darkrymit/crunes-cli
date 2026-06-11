import { describe, it, expect } from 'vitest'
import { matchStorePermission } from '../../../src/rune/permissions/permissions-store.js'

describe('matchStorePermission', () => {
  it('splits on double colon and ignores single colons in Windows absolute path locations', () => {
    expect(matchStorePermission(
      'C:\\databases\\main::users',
      'C:\\databases\\main::users'
    )).toBe(true)
  })

  it('permits access when name is omitted/null (any entity/table allowed)', () => {
    expect(matchStorePermission(
      'C:\\databases\\main::users',
      'C:\\databases\\main'
    )).toBe(true)
  })

  it('rejects access when name does not match restricted name', () => {
    expect(matchStorePermission(
      'C:\\databases\\main::orders',
      'C:\\databases\\main::users'
    )).toBe(false)
  })

  it('supports asterisk wildcard for any table/bucket restriction', () => {
    expect(matchStorePermission(
      'C:\\databases\\main::orders',
      'C:\\databases\\main::*'
    )).toBe(true)
  })

  it('does NOT fall back to single-colon parsing (rejects legacy format)', () => {
    expect(matchStorePermission(
      './db::users',
      './db:users'
    )).toBe(false)
  })

  it('correctly handles virtual root path locations with double colons', () => {
    expect(matchStorePermission(
      '@project/data.sqlite::users',
      '@project/data.sqlite::users'
    )).toBe(true)

    expect(matchStorePermission(
      '@project/data.sqlite::orders',
      '@project/data.sqlite::users'
    )).toBe(false)
  })

  it('correctly handles virtual root wildcards with /**', () => {
    expect(matchStorePermission(
      '@project/db/main::users',
      '@project/db/**::users'
    )).toBe(true)

    expect(matchStorePermission(
      '@project/db/main::orders',
      '@project/db/**::users'
    )).toBe(false)
  })
})
