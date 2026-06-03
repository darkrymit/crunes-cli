import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js'

describe('Global Sandbox APIs', () => {
  let tmp

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-time-globals-'))
  })

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  it('setTimeout executes callback after delay and passes arguments', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function run() {',
      '  let called = false',
      '  let receivedArgs = []',
      '  setTimeout((arg1, arg2) => {',
      '    called = true',
      '    receivedArgs = [arg1, arg2]',
      '  }, 50, "hello", "world")',
      '  ',
      '  // Wait long enough for the timer to resolve',
      '  await new Promise(resolve => setTimeout(resolve, 100))',
      '  ',
      '  return [section.create("t", { type: "markdown", content: JSON.stringify({ called, args: receivedArgs }) })]',
      '}',
    ].join('\n'))

    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    const content = JSON.parse(result[0].data.content)
    expect(content.called).toBe(true)
    expect(content.args).toEqual(['hello', 'world'])
  })

  it('clearTimeout cancels timeout execution', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function run() {',
      '  let called = false',
      '  const id = setTimeout(() => {',
      '    called = true',
      '  }, 50)',
      '  ',
      '  clearTimeout(id)',
      '  ',
      '  // Wait long enough to be sure it would have executed',
      '  await new Promise(resolve => setTimeout(resolve, 100))',
      '  ',
      '  return [section.create("t", { type: "markdown", content: String(called) })]',
      '}',
    ].join('\n'))

    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('false')
  })

  it('setInterval runs repeatedly and is cancelled by clearInterval', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function run() {',
      '  let count = 0',
      '  const id = setInterval(() => {',
      '    count++',
      '  }, 20)',
      '  ',
      '  // Let it execute a few times',
      '  await new Promise(resolve => setTimeout(resolve, 70))',
      '  ',
      '  clearInterval(id)',
      '  const finalCount = count',
      '  ',
      '  // Wait to ensure no further executions happen',
      '  await new Promise(resolve => setTimeout(resolve, 50))',
      '  ',
      '  return [section.create("t", { type: "markdown", content: JSON.stringify({ countAfterClear: count, finalCount }) })]',
      '}',
    ].join('\n'))

    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    const content = JSON.parse(result[0].data.content)
    expect(content.finalCount).toBeGreaterThanOrEqual(2)
    expect(content.countAfterClear).toBe(content.finalCount)
  })

  it('default delay of 0 is applied', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function run() {',
      '  let called = false',
      '  setTimeout(() => {',
      '    called = true',
      '  })',
      '  ',
      '  await new Promise(resolve => setTimeout(resolve, 20))',
      '  return [section.create("t", { type: "markdown", content: String(called) })]',
      '}',
    ].join('\n'))

    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('true')
  })

  it('TextEncoder and TextDecoder are exposed and operate correctly', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function run() {',
      '  const encoder = new TextEncoder()',
      '  const decoder = new TextDecoder()',
      '  const original = "Hello Isolated-VM!"',
      '  const encoded = encoder.encode(original)',
      '  const decoded = decoder.decode(encoded)',
      '  const isUint8Array = encoded instanceof Uint8Array',
      '  return [section.create("t", { type: "markdown", content: JSON.stringify({ isUint8Array, decoded }) })]',
      '}',
    ].join('\n'))

    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    const content = JSON.parse(result[0].data.content)
    expect(content.isUint8Array).toBe(true)
    expect(content.decoded).toBe('Hello Isolated-VM!')
  })
})
