import { describe, it, expect, vi } from 'vitest'
import { createDbUtils } from '../../../src/rune/api/db.js'

// Mock pg loading so it doesn't try to connect to a real database
vi.mock('pg', () => {
  return {
    default: {
      Client: class {
        connect() { return Promise.resolve() }
      }
    }
  }
})

describe('createDbUtils', () => {
  it('throws error when connecting to unsupported protocol', async () => {
    const dbUtils = createDbUtils('/test', () => {})
    await expect(dbUtils.connect('mongodb://localhost:27017/db')).rejects.toThrow(
      'Unsupported DB protocol: "mongodb"'
    )
  })

  it('triggers permission checks with host and database scopes', async () => {
    const checkedTokens = []
    const checkPermission = (cap, val) => {
      checkedTokens.push(`${cap}:${val}`)
    }
    const dbUtils = createDbUtils('/test', checkPermission)

    try {
      await dbUtils.connect('postgres://user:pass@mydb.com:5432/production')
    } catch {
      // expected to fail query mock eventually, just verifying permission triggers
    }

    expect(checkedTokens).toContain('db.connect:postgres:mydb.com:5432/production')
  })
})
