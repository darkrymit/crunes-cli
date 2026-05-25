import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { getPluginRunePath, runRuneInIsolate, getArgsSchema } from '../../../src/rune/isolation/runner.js'
import { createJob, projectKey } from '../../../src/job/registry.js'

function startEchoServer() {
  return new Promise((resolve) => {
    const httpServer = createServer()
    const wss = new WebSocketServer({ server: httpServer })
    wss.on('connection', (ws) => {
      ws.on('message', (data) => ws.send(String(data)))
    })
    httpServer.listen(0, () => {
      const { port } = httpServer.address()
      resolve({ wss, httpServer, port, url: `ws://localhost:${port}` })
    })
  })
}

function stopServer({ wss, httpServer }) {
  return new Promise((resolve) => {
    wss.close(() => httpServer.close(resolve))
  })
}

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
      '  return [section.create("test", { type: "markdown", content: args._[0] ?? "hi" })]',
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

  it('auto-grant allows fs.read of .crunes/** without explicit permission', async () => {
    const crunesDir = join(tmp, '.crunes')
    const stateFile = join(crunesDir, 'state.json')
    await mkdir(crunesDir, { recursive: true })
    await writeFile(stateFile, JSON.stringify({ ok: true }), 'utf8')

    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { json, section } from "@utils"',
      'export async function use() {',
      '  const data = await json.read(".crunes/state.json")',
      '  return [section.create("r", { type: "markdown", content: String(data.ok) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('true')
  })
})

describe('rune.spawn / rune.kill / rune.exists permission enforcement', () => {
  let tmp

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-spawn-'))
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('rune.spawn throws PermissionError when rune.spawn:<key> not in allow', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      'export async function use(args) {',
      '  await rune.spawn("worker", [])',
      '  return section.create("x", { type: "markdown", content: "ok" })',
      '}',
    ].join('\n'))
    await expect(
      runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    ).rejects.toThrow("'rune.spawn:worker' is not permitted.")
  })

  it('rune.kill throws PermissionError when job exists but rune.kill:<runeKey> not in allow', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 'server', runeKey: 'worker', projectDir: tmp, args: [] })
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      `export async function use(args) {`,
      `  await rune.kill(${JSON.stringify(id)})`,
      '  return section.create("x", { type: "markdown", content: "ok" })',
      '}',
    ].join('\n'))
    await expect(
      runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    ).rejects.toThrow("'rune.kill:worker' is not permitted.")
  })

  it('rune.exists throws PermissionError when job exists but rune.exists:<runeKey> not in allow', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 'server', runeKey: 'worker', projectDir: tmp, args: [] })
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      `export async function use(args) {`,
      `  await rune.exists(${JSON.stringify(id)})`,
      '  return section.create("x", { type: "markdown", content: "ok" })',
      '}',
    ].join('\n'))
    await expect(
      runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    ).rejects.toThrow("'rune.exists:worker' is not permitted.")
  })

  it('rune.exists returns false for a nonexistent job id without checking permissions', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      'export async function use(args) {',
      '  const alive = await rune.exists("no-such-job")',
      '  return [section.create("x", { type: "markdown", content: String(alive) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(
      runeFile,
      { allow: [], deny: [] },
      [],
      tmp
    )
    expect(result[0].data.content).toBe('false')
  })

  it('rune.kill is a no-op for a nonexistent job id', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      'export async function use(args) {',
      '  await rune.kill("no-such-job")',
      '  return [section.create("x", { type: "markdown", content: "ok" })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('ok')
  })

  it('rune.kill is a no-op for a job from a different project (structural isolation)', async () => {
    const otherProject = join(tmp, 'other')
    const { id } = await createJob(process.pid, { spawnedBy: 'server', runeKey: 'worker', projectDir: otherProject, args: [] })
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      `export async function use(args) {`,
      `  await rune.kill(${JSON.stringify(id)})`,
      '  return [section.create("x", { type: "markdown", content: "ok" })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: ['rune.kill:*'], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('ok')
  })
})

describe('getArgsSchema', () => {
  let tmp

  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-schema-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('returns null when rune has no args export', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function use(args) { return [] }',
    ].join('\n'))
    expect(await getArgsSchema(runeFile, { allow: [], deny: [] }, tmp)).toBeNull()
  })

  it('returns schema when rune exports args()', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'export async function args(b) {',
      '  return b.option("--strict", "Strict mode", false).build()',
      '}',
      'export async function use(args) { return [] }',
    ].join('\n'))
    const schema = await getArgsSchema(runeFile, { allow: [], deny: [] }, tmp)
    expect(schema).toMatchObject({
      options: [{ flags: '--strict', description: 'Strict mode', def: false }],
    })
  })

  it('args() can import from @utils', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function args(b) {',
      '  return b.option("-c, --count <number>", "Count", 5).build()',
      '}',
      'export async function use(args) { return [] }',
    ].join('\n'))
    const schema = await getArgsSchema(runeFile, { allow: [], deny: [] }, tmp)
    expect(schema.options[0].def).toBe(5)
  })

  it('returns examples when args() calls .example()', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'export async function args(b) {',
      '  return b',
      '    .option("--strict", "Strict", false)',
      '    .example("crunes use myrune foo", "Basic use")',
      '    .example("crunes use myrune foo --strict")',
      '    .build()',
      '}',
      'export async function use(args) { return [] }',
    ].join('\n'))
    const schema = await getArgsSchema(runeFile, { allow: [], deny: [] }, tmp)
    expect(schema.examples).toHaveLength(2)
    expect(schema.examples[0]).toMatchObject({ usage: 'crunes use myrune foo', description: 'Basic use' })
    expect(schema.examples[1]).toMatchObject({ usage: 'crunes use myrune foo --strict' })
  })
})

describe('runRuneInIsolate — declarative args parsing', () => {
  let tmp

  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-decl-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('use(args) receives best-effort parsed object when no args() export', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function use(args) {',
      '  return [section.create("t", { type: "markdown", content: JSON.stringify({ pos: args._, raw: args.$raw }) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, ['hello'], tmp)
    const data = JSON.parse(result[0].data.content)
    expect(data.pos).toContain('hello')
    expect(data.raw).toEqual(['hello'])
  })

  it('use(args) receives schema-parsed object when args() is exported', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function args(b) {',
      '  return b.option("-c, --count <number>", "Count", 0).build()',
      '}',
      'export async function use(parsed) {',
      '  return [section.create("t", { type: "markdown", content: String(parsed.count) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, ['-c', '7'], tmp)
    expect(result[0].data.content).toBe('7')
  })

  it('args.$raw contains original raw array', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function use(args) {',
      '  return [section.create("t", { type: "markdown", content: JSON.stringify(args.$raw) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, ['a', 'b'], tmp)
    expect(JSON.parse(result[0].data.content)).toEqual(['a', 'b'])
  })

  it('schema default is applied when flag is absent', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function args(b) {',
      '  return b.option("--strict", "Strict", false).build()',
      '}',
      'export async function use(parsed) {',
      '  return [section.create("t", { type: "markdown", content: String(parsed.strict) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('false')
  })
})

describe('runRuneInIsolate — ws integration', () => {
  let tmp
  let echoServer

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-ws-'))
    echoServer = await startEchoServer()
  })

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
    await stopServer(echoServer)
  })

  it('rune can open a ws connection, send a message, and receive the echo', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { ws, section } from '@utils'
export async function use() {
  const socket = ws.client('${echoServer.url}')
  let received = ''
  socket.on('message', async (msg) => {
    received = msg
    socket.close()
  })
  await socket.open()
  await socket.sendText('hello-ws')
  await socket.close()
  return [section.create('result', { type: 'markdown', content: received })]
}
`)
    const result = await runRuneInIsolate(
      runeFile,
      { allow: [`ws.client:${echoServer.url}/**`, `ws.client:${echoServer.url}`], deny: [] },
      [],
      tmp,
    )
    expect(result[0].data.content).toBe('hello-ws')
  })

  it('rune throws PermissionError when ws URL is not permitted', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { ws, section } from '@utils'
export async function use() {
  const socket = ws.client('${echoServer.url}')
  await socket.open()
  return [section.create('r', { type: 'markdown', content: 'ok' })]
}
`)
    await expect(
      runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    ).rejects.toThrow()
  })

  it('rune can exchange multiple messages in sequence', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { ws, section } from '@utils'
export async function use() {
  const socket = ws.client('${echoServer.url}')
  const msgs = []
  let count = 0
  socket.on('message', async (msg) => {
    msgs.push(msg)
    count++
    if (count >= 3) socket.close()
  })
  await socket.open()
  await socket.sendText('a')
  await socket.sendText('b')
  await socket.sendText('c')
  await socket.close()
  return [section.create('r', { type: 'markdown', content: msgs.join(',') })]
}
`)
    const result = await runRuneInIsolate(
      runeFile,
      { allow: [`ws.client:${echoServer.url}/**`, `ws.client:${echoServer.url}`], deny: [] },
      [],
      tmp,
    )
    expect(result[0].data.content).toBe('a,b,c')
  })

  it('dispose cleans up open ws sessions when rune exits without closing', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { ws, section } from '@utils'
export async function use() {
  const socket = ws.client('${echoServer.url}')
  await socket.open()
  return [section.create('r', { type: 'markdown', content: 'done' })]
}
`)
    const result = await runRuneInIsolate(
      runeFile,
      { allow: [`ws.client:${echoServer.url}/**`, `ws.client:${echoServer.url}`], deny: [] },
      [],
      tmp,
    )
    expect(result[0].data.content).toBe('done')
  })
})
