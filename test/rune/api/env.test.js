import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }))
vi.mock('dotenv', () => ({ parse: vi.fn() }))

import { readFileSync } from 'node:fs'
import { parse } from 'dotenv'
import { makePermissionChecker } from '../../../src/rune/permissions/permissions.js'
import { createEnvUtils } from '../../../src/rune/api/env.js'

describe('createEnvUtils', () => {
  const dir = '/project'

  afterEach(() => { vi.clearAllMocks() })

  it('get returns value from process.env when permitted', () => {
    process.env.MY_TOKEN = 'secret'
    const utils = createEnvUtils(dir, null, { allow: ['env:process:MY_TOKEN'], deny: [] })
    expect(utils.get('MY_TOKEN')).toBe('secret')
    delete process.env.MY_TOKEN
  })

  it('get returns value from .env file when permitted', () => {
    readFileSync.mockReturnValue('DB_URL=postgres://localhost')
    parse.mockReturnValue({ DB_URL: 'postgres://localhost' })
    const utils = createEnvUtils(dir, null, { allow: ['env:.env:DB_URL'], deny: [] })
    expect(utils.get('DB_URL')).toBe('postgres://localhost')
    expect(readFileSync).toHaveBeenCalledWith('/project/.env', 'utf8')
  })

  it('multi-entry allow drives source order — process entry first wins', () => {
    process.env.API_KEY = 'from-process'
    readFileSync.mockReturnValue('')
    parse.mockReturnValue({ API_KEY: 'from-file' })
    const utils = createEnvUtils(dir, null, {
      allow: ['env:process:API_KEY', 'env:.env:API_KEY'],
      deny: [],
    })
    expect(utils.get('API_KEY')).toBe('from-process')
    delete process.env.API_KEY
  })

  it('multi-entry allow drives source order — .env entry first wins', () => {
    process.env.API_KEY = 'from-process'
    readFileSync.mockReturnValue('')
    parse.mockReturnValue({ API_KEY: 'from-file' })
    const utils = createEnvUtils(dir, null, {
      allow: ['env:.env:API_KEY', 'env:process:API_KEY'],
      deny: [],
    })
    expect(utils.get('API_KEY')).toBe('from-file')
    delete process.env.API_KEY
  })

  it('get returns fallback when key not found in any permitted source', () => {
    const utils = createEnvUtils(dir, null, { allow: ['env:process:NONEXISTENT'], deny: [] })
    expect(utils.get('NONEXISTENT', 'default')).toBe('default')
    expect(utils.get('NONEXISTENT')).toBeUndefined()
  })

  it('has returns true when key exists in a permitted source', () => {
    process.env.EXISTS = 'yes'
    const utils = createEnvUtils(dir, null, { allow: ['env:process:EXISTS'], deny: [] })
    expect(utils.has('EXISTS')).toBe(true)
    delete process.env.EXISTS
  })

  it('has returns false when key not found', () => {
    const utils = createEnvUtils(dir, null, { allow: ['env:process:GONE'], deny: [] })
    expect(utils.has('GONE')).toBe(false)
  })

  it('checkPermission throwing skips that source', () => {
    process.env.SECRET = 'val'
    const check = makePermissionChecker({
      allow: ['env:process:SECRET'],
      deny:  ['env:process:SECRET'],
    })
    const utils = createEnvUtils(dir, check, { allow: ['env:process:SECRET'], deny: [] })
    expect(utils.get('SECRET', 'fallback')).toBe('fallback')
    delete process.env.SECRET
  })

  it('missing .env file is silently ignored — get returns fallback', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const utils = createEnvUtils(dir, null, { allow: ['env:.env:KEY'], deny: [] })
    expect(utils.get('KEY', 'fallback')).toBe('fallback')
  })

  it('multiple allow patterns — each pattern tried in order', () => {
    readFileSync.mockReturnValue('')
    parse.mockReturnValue({ API_KEY: 'file-val' })
    process.env.DB_HOST = 'localhost'
    const utils = createEnvUtils(dir, null, {
      allow: ['env:.env:API_*', 'env:process:DB_*'],
      deny: [],
    })
    expect(utils.get('API_KEY')).toBe('file-val')
    expect(utils.get('DB_HOST')).toBe('localhost')
    delete process.env.DB_HOST
  })

  it('.env file contents are cached — readFileSync called only once per source', () => {
    readFileSync.mockReturnValue('')
    parse.mockReturnValue({ CACHED: 'yes' })
    const utils = createEnvUtils(dir, null, { allow: ['env:.env:CACHED'], deny: [] })
    utils.get('CACHED')
    utils.get('CACHED')
    expect(readFileSync).toHaveBeenCalledTimes(1)
  })
})
