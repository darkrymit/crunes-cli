import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { getPluginRunePath, runRuneInIsolate } from '../../../src/rune/isolation/runner.js'

describe('getPluginRunePath', () => {
  it('uses convention runes/<key>.js when plugin.json has no path', () => {
    const pluginJson = { runes: { hello: { permissions: { use: { allow: [] } } } } }
    expect(getPluginRunePath('/plugin', 'hello', pluginJson))
      .toBe(join('/plugin', 'runes/hello.js'))
  })

  it('uses custom path when rune entry declares path', () => {
    const pluginJson = { runes: { hello: { path: 'lib/runes/hello.js', permissions: { use: { allow: [] } } } } }
    expect(getPluginRunePath('/plugin', 'hello', pluginJson))
      .toBe(join('/plugin', 'lib/runes/hello.js'))
  })

  it('handles missing rune entry gracefully (falls back to convention)', () => {
    const pluginJson = { runes: {} }
    expect(getPluginRunePath('/plugin', 'hello', pluginJson))
      .toBe(join('/plugin', 'runes/hello.js'))
  })
})

describe('@utils virtual module', () => {
  let tmp

  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-utils-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('resolves @utils import and calls use(args)', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function use(args) {',
      '  return [section.create("test", { type: "markdown", content: args[0] ?? "hi" })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, ['world'], tmp)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: 'test', data: { content: 'world' } })
  })

  it('fs.cwd() returns absolute project dir', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { fs, section } from "@utils"',
      'export async function use(args) {',
      '  return [section.create("cwd", { type: "markdown", content: fs.cwd() })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    expect(result[0]).toMatchObject({ name: 'cwd', data: { content: tmp } })
  })
})
