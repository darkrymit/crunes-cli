import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js'

describe('sqlite bridge error propagation', () => {
  let tmp

  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-sqlite-err-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  const effective = { allow: ['sqlite.read:./::test', 'sqlite.write:./::test'], deny: [] }

  it('db.query syntax error is catchable in rune try/catch', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { sqlite, section } from "@utils"',
      'export async function run() {',
      '  const db = await sqlite.open("./", "test")',
      '  let msg',
      '  try {',
      '    await db.query("this is not valid sql")',
      '    msg = "no error"',
      '  } catch(e) {',
      '    msg = "caught: " + e.message',
      '  }',
      '  await db.close()',
      '  return [section.create("r", { type: "markdown", content: msg })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, effective, [], tmp)
    expect(result[0].data.content).toMatch(/^caught:/)
  })

  it('db.exec syntax error is catchable in rune try/catch', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { sqlite, section } from "@utils"',
      'export async function run() {',
      '  const db = await sqlite.open("./", "test")',
      '  let msg',
      '  try {',
      '    await db.exec("not valid sql either")',
      '    msg = "no error"',
      '  } catch(e) {',
      '    msg = "caught: " + e.message',
      '  }',
      '  await db.close()',
      '  return [section.create("r", { type: "markdown", content: msg })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, effective, [], tmp)
    expect(result[0].data.content).toMatch(/^caught:/)
  })

  it('valid db.query still works after fix', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { sqlite, section } from "@utils"',
      'export async function run() {',
      '  const db = await sqlite.open("./", "test")',
      '  await db.run("CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)")',
      '  const rows = await db.query("SELECT 1 as n")',
      '  await db.close()',
      '  return [section.create("r", { type: "markdown", content: String(rows[0].n) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, effective, [], tmp)
    expect(result[0].data.content).toBe('1')
  })
})
