import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertSqliteDb } from '../../../src/sqlite/index.js'
import { handler } from '../../../src/sqlite/commands/list.js'

const PLUGIN_ID = 'my-plugin@1.0.0'

describe('sqlite list handler', () => {
  let tmp
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-sqlite-cmd-'))
    process.env.CRUNES_STORE = tmp
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    vi.restoreAllMocks()
    await rm(tmp, { recursive: true, force: true })
  })

  it('prints "No SQLite databases." when index is empty', async () => {
    await handler({ projectDir: tmp })
    expect(console.log).toHaveBeenCalledWith('No SQLite databases.')
  })

  it('prints a table with header and a row per database', async () => {
    const dbPath = join(tmp, 'sqlite', 'plugins', PLUGIN_ID, 'notes.sqlite')
    await upsertSqliteDb(dbPath, { scope: 'global-plugin', projectId: null, pluginId: PLUGIN_ID, location: '@global-plugin-sqlite', name: 'notes' })
    await handler({ projectDir: tmp })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('KEY'))).toBe(true)
    expect(lines.some(l => l.includes('notes'))).toBe(true)
  })

  it('shows local-sqlite databases scanned from project dir', async () => {
    const localPath = join(tmp, '.crunes', 'sqlite', 'project')
    await mkdir(localPath, { recursive: true })
    await writeFile(join(localPath, 'mylocal.sqlite'), '')
    await handler({ projectDir: tmp })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('mylocal'))).toBe(true)
  })
})
