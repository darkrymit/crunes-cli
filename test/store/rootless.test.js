import { describe, it, expect, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { isRootless, getLocalBase, getStorePath } from '../../src/store/index.js'

let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'crunes-rootless-'))
  process.env.CRUNES_STORE = mkdtempSync(path.join(os.tmpdir(), 'crunes-rootless-store-'))
})

describe('isRootless', () => {
  it('is true for a directory with no project config', () => {
    expect(isRootless(dir)).toBe(true)
  })

  it('is false once a project config exists', () => {
    mkdirSync(path.join(dir, '.crunes'), { recursive: true })
    writeFileSync(path.join(dir, '.crunes', 'config.json'), '{}')
    expect(isRootless(dir)).toBe(false)
  })
})

describe('getLocalBase', () => {
  it('points into the store, never the working directory, when rootless', () => {
    const base = getLocalBase(dir).replace(/\\/g, '/')
    expect(base.startsWith(getStorePath().replace(/\\/g, '/') + '/rootless/')).toBe(true)
    expect(base.startsWith(dir.replace(/\\/g, '/'))).toBe(false)
  })

  it('is stable for the same directory and distinct across directories', () => {
    const other = mkdtempSync(path.join(os.tmpdir(), 'crunes-rootless-b-'))
    expect(getLocalBase(dir)).toBe(getLocalBase(dir))
    expect(getLocalBase(dir)).not.toBe(getLocalBase(other))
  })

  it('uses the project .crunes dir when a project config exists', () => {
    mkdirSync(path.join(dir, '.crunes'), { recursive: true })
    writeFileSync(path.join(dir, '.crunes', 'config.json'), '{}')
    expect(getLocalBase(dir)).toBe(path.join(dir, '.crunes'))
  })

  it('leaves the working directory untouched when rootless', () => {
    getLocalBase(dir)
    expect(readdirSync(dir)).toEqual([])
  })
})

describe('rootless run invariant', () => {
  it('leaves the working directory empty after running a global rune', () => {
    const store = process.env.CRUNES_STORE
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'crunes-rootless-cwd-'))
    mkdirSync(path.join(store, 'runes'), { recursive: true })
    writeFileSync(path.join(store, 'runes', 'ping.js'),
      `import { section } from '@utils'\nexport function run() { return section.create('ok', { type: 'markdown', content: 'pong' }) }\n`)
    writeFileSync(path.join(store, 'config.json'),
      JSON.stringify({ runes: { ping: { path: 'runes/ping.js' } } }))

    execFileSync('node', [path.resolve('dist/cli.js'), '-p', 'run', 'ping'], {
      cwd,
      env: { ...process.env, CRUNES_STORE: store },
    })

    expect(readdirSync(cwd)).toEqual([])
  })
})
