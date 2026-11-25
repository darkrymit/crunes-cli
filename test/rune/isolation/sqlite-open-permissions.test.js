import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js'
import { setupCrunesTest } from '../../../src/test/index.js'

let root, project
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'crunes-sqlite-open-'))
  project = join(root, 'project')
  await mkdir(project)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

async function run(body, allow) {
  const rune = join(project, 'rune.js')
  await writeFile(rune, `import { sqlite } from '@utils'\nexport async function run() { ${body} }`)
  return runRuneInIsolate(rune, { allow, deny: [] }, [], project)
}
const hash = f => createHash('sha1').update(readFileSync(f)).digest('hex')

function makeForeign(journal) {
  const file = join(root, 'foreign.db')
  const db = new Database(file)
  db.pragma(`journal_mode = ${journal}`)
  db.exec('CREATE TABLE t (v TEXT, b BLOB)')
  db.prepare('INSERT INTO t VALUES (?, ?)').run('hello', Buffer.from([1, 2, 255]))
  return { file, db }
}

describe('sqlite.open permissions', () => {
  it('touches nothing on disk without a grant', async () => {
    await expect(run(`await sqlite.open('../outside/dir', 'made')`, [])).rejects.toThrow('sqlite.read')
    expect(existsSync(join(root, 'outside'))).toBe(false)
  })

  it('does not create a database with only a read grant', async () => {
    await expect(run(`await sqlite.open('../outside', 'made')`, ['sqlite.read:../outside::made'])).rejects.toThrow('sqlite.write grant')
    expect(existsSync(join(root, 'outside'))).toBe(false)
  })

  it('reads an existing database with a read grant and leaves the file unchanged', async () => {
    const { file, db } = makeForeign('DELETE')
    db.close()
    const before = hash(file)
    const rows = await run(`const d = await sqlite.open('..', 'foreign.db'); const r = await d.query('SELECT v, b FROM t'); await d.close(); return [r[0].v, Array.from(r[0].b)]`, ['sqlite.read:..::foreign.db'])
    expect(rows).toEqual(['hello', [1, 2, 255]])
    expect(hash(file)).toBe(before)
  })

  it('sees committed rows of a WAL database another process holds open, without checkpointing it', async () => {
    const { file, db } = makeForeign('WAL')
    db.prepare('INSERT INTO t VALUES (?, ?)').run('still in wal', null)
    const before = [hash(file), hash(file + '-wal')]
    const rows = await run(`const d = await sqlite.open('..', 'foreign.db'); const r = await d.query('SELECT v FROM t'); await d.close(); return r.map(x => x.v)`, ['sqlite.read:..::foreign.db'])
    expect(rows).toEqual(['hello', 'still in wal'])
    expect([hash(file), hash(file + '-wal')]).toEqual(before)
    db.prepare('INSERT INTO t VALUES (?, ?)').run('writer still works', null)
    db.close()
  })

  it('refuses a write through a handle opened with only a read grant', async () => {
    makeForeign('DELETE').db.close()
    await expect(run(`const d = await sqlite.open('..', 'foreign.db'); await d.query("INSERT INTO t VALUES ('x', NULL) RETURNING v")`, ['sqlite.read:..::foreign.db'])).rejects.toThrow('readonly')
  })

  it('still creates and writes with a write grant', async () => {
    const r = await run(`const d = await sqlite.open('./data', 'mine'); await d.run('CREATE TABLE t (v)'); await d.exec('INSERT INTO t VALUES (1)'); const x = await d.get('SELECT v FROM t'); await d.close(); return x.v`, ['sqlite.read:./data::mine', 'sqlite.write:./data::mine'])
    expect(r).toBe(1)
  })

  it('is available in setupCrunesTest with the same checks', async () => {
    makeForeign('DELETE').db.close()
    const open = async allow => {
      const { utils, cleanup } = setupCrunesTest({ cwd: project, permissions: { allow, deny: [] } })
      try {
        const d = await utils.sqlite.open(root.replaceAll('\\', '/'), 'foreign.db')
        const r = await d.get('SELECT v FROM t')
        await d.close()
        return r.v
      } finally { await cleanup() }
    }
    expect(await open([`sqlite.read:${root.replaceAll('\\', '/')}::foreign.db`])).toBe('hello')
    await expect(open([])).rejects.toThrow('sqlite.read')
  })
})
