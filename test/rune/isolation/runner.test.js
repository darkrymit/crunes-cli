import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { getPluginRunePath, runRuneInIsolate, getArgsSchema } from '../../../src/rune/isolation/runner.js'
import { createJob } from '../../../src/job/registry.js'

vi.mock('pg', () => {
  return {
    default: {
      Client: class {
        async connect() {}
        async query(sql, params) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return { rows: [], rowCount: 0 }
          }
          if (sql.includes('SELECT')) {
            return { rows: [{ id: 42, name: 'Alice' }], rowCount: 1 }
          }
          if (sql.includes('UPDATE')) {
            return { rows: [], rowCount: 1 }
          }
          return { rows: [], rowCount: 0 }
        }
        async end() {}
      }
    }
  }
})

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
      'export async function run(args) {',
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
      'export async function run(args) {',
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
      'export async function run() {',
      '  const data = await json.read(".crunes/state.json")',
      '  return [section.create("r", { type: "markdown", content: String(data.ok) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('true')
  })
})

describe('rune.job.* permission enforcement', () => {
  let tmp

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-spawn-'))
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('rune.job.start throws PermissionError when rune.job.start:<key> not in allow', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      'export async function run(args) {',
      '  await rune.job.start("worker", [])',
      '  return section.create("x", { type: "markdown", content: "ok" })',
      '}',
    ].join('\n'))
    await expect(
      runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    ).rejects.toThrow("'rune.job.start:worker' is not permitted.")
  })

  it('rune.job.kill throws PermissionError when rune.job.kill not in allow', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 'server', runeKey: 'worker', projectDir: tmp, args: [] })
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      `export async function run(args) {`,
      `  await rune.job.kill(${JSON.stringify(id)})`,
      '  return section.create("x", { type: "markdown", content: "ok" })',
      '}',
    ].join('\n'))
    await expect(
      runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    ).rejects.toThrow("'rune.job.kill:' is not permitted.")
  })

  it('rune.job.exists throws PermissionError when rune.job.exists not in allow', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 'server', runeKey: 'worker', projectDir: tmp, args: [] })
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      `export async function run(args) {`,
      `  await rune.job.exists(${JSON.stringify(id)})`,
      '  return section.create("x", { type: "markdown", content: "ok" })',
      '}',
    ].join('\n'))
    await expect(
      runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    ).rejects.toThrow("'rune.job.exists:' is not permitted.")
  })

  it('rune.job.exists returns false for a nonexistent job id', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      'export async function run(args) {',
      '  const alive = await rune.job.exists("no-such-job")',
      '  return [section.create("x", { type: "markdown", content: String(alive) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(
      runeFile,
      { allow: ['rune.job.exists'], deny: [] },
      [],
      tmp
    )
    expect(result[0].data.content).toBe('false')
  })

  it('rune.job.kill is a no-op for a nonexistent job id', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      'export async function run(args) {',
      '  await rune.job.kill("no-such-job")',
      '  return [section.create("x", { type: "markdown", content: "ok" })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: ['rune.job.kill'], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('ok')
  })

  it('rune.job.kill is a no-op for a job from a different project (structural isolation)', async () => {
    const otherProject = join(tmp, 'other')
    const { id } = await createJob(process.pid, { spawnedBy: 'server', runeKey: 'worker', projectDir: otherProject, args: [] })
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { rune, section } from "@utils"',
      `export async function run(args) {`,
      `  await rune.job.kill(${JSON.stringify(id)})`,
      '  return [section.create("x", { type: "markdown", content: "ok" })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: ['rune.job.kill'], deny: [] }, [], tmp)
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
      'export async function run(args) { return [] }',
    ].join('\n'))
    expect(await getArgsSchema(runeFile, { allow: [], deny: [] }, tmp)).toBeNull()
  })

  it('returns schema when rune exports args()', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'export async function args(b) {',
      '  return b.option("--strict", "Strict mode", false).build()',
      '}',
      'export async function run(args) { return [] }',
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
      'export async function run(args) { return [] }',
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
      '    .example("crunes run myrune foo", "Basic use")',
      '    .example("crunes run myrune foo --strict")',
      '    .build()',
      '}',
      'export async function run(args) { return [] }',
    ].join('\n'))
    const schema = await getArgsSchema(runeFile, { allow: [], deny: [] }, tmp)
    expect(schema.examples).toHaveLength(2)
    expect(schema.examples[0]).toMatchObject({ usage: 'crunes run myrune foo', description: 'Basic use' })
    expect(schema.examples[1]).toMatchObject({ usage: 'crunes run myrune foo --strict' })
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
      'export async function run(args) {',
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
      'export async function run(parsed) {',
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
      'export async function run(args) {',
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
      'export async function run(parsed) {',
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
export async function run() {
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
export async function run() {
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
export async function run() {
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
  await socket.closed()
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
export async function run() {
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

describe('TextEncoder, TextDecoder, AbortController, and AbortSignal sandbox integration', () => {
  let tmp

  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-enc-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('provides working TextEncoder and TextDecoder with custom options', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { section } from '@utils'
export async function run() {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder('utf-8')
    const encoded = encoder.encode('héllo 🚀')
    const decoded = decoder.decode(encoded)
    return [section.create('r', { type: 'markdown', content: decoded })]
}
`)
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('héllo 🚀')
  })

  it('provides AbortController and AbortSignal globally', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { section } from '@utils'
export async function run() {
    const controller = new AbortController()
    let aborted = false
    controller.signal.addEventListener('abort', () => {
      aborted = true
    })
    controller.abort()
    const content = controller.signal.aborted && aborted ? 'aborted' : 'active'
    return [section.create('r', { type: 'markdown', content })]
}
`)
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('aborted')
  })
})

describe('progressive section emission', () => {
  let tmp

  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-sec-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('allows section.emit to progressively emit sections in real-time', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { section } from '@utils'
export async function run() {
  section.emit(section.create('progressive-1', { type: 'markdown', content: 'hello from step 1' }))
  section.emit(section.create('progressive-2', { type: 'markdown', content: 'hello from step 2' }))
  return []
}
`)
    const events = []
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp, {
      onEvent(event) {
        events.push(event)
      }
    })
    expect(result).toEqual([])
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      type: 'section',
      section: { name: 'progressive-1', data: { type: 'markdown', content: 'hello from step 1' } }
    })
    expect(events[1]).toMatchObject({
      type: 'section',
      section: { name: 'progressive-2', data: { type: 'markdown', content: 'hello from step 2' } }
    })
  })
})

describe('spawn-like ShellSession sandbox integration', () => {
  let tmp

  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-shell-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('provides spawn-like streams and AbortSignal support', async () => {
    const scriptPath = join(tmp, 'echo.js')
    await writeFile(scriptPath, `
      process.stdout.write('Question:');
      process.stdin.on('data', (d) => {
        if (d.toString().trim() === '42') {
          process.stdout.write('Correct\\n');
          process.exit(0);
        } else {
          process.stdout.write('Wrong\\n');
          process.exit(1);
        }
      });
    `)

    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { shell, section } from '@utils'
export async function run() {
  const session = shell.spawn('node ${scriptPath.replace(/\\/g, '\\\\')}', { binary: true })
  let stdoutStr = ''
  
  await new Promise((resolve, reject) => {
    session.stdout.on('data', (bytes) => {
      const text = new TextDecoder().decode(bytes)
      stdoutStr += text
      if (stdoutStr.includes('Question:')) {
        session.stdin.write('42\\n')
      }
    })
    session.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error('exit ' + code))
    })
    session.on('error', reject)
    session.open()
  })

  return [section.create('r', { type: 'markdown', content: stdoutStr })]
}
`)

    const result = await runRuneInIsolate(runeFile, { allow: ['shell.run:**'], deny: [] }, [], tmp)
    expect(result[0].data.content).toContain('Correct')
  })

  it('terminates process when AbortSignal is aborted', async () => {
    const scriptPath = join(tmp, 'sleep.js')
    await writeFile(scriptPath, `
      setTimeout(() => {}, 10000);
    `)

    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { shell, section } from '@utils'
export async function run() {
  const controller = new AbortController()
  const session = shell.spawn('node ${scriptPath.replace(/\\/g, '\\\\')}', {
    signal: controller.signal
  })
  
  let exitCode = null
  let exitedPromise = new Promise((resolve) => {
    session.on('exit', (code) => {
      exitCode = code
      resolve()
    })
  })
  session.open()

  setTimeout(() => {
    controller.abort()
  }, 100)
  
  await exitedPromise
  
  await new Promise(r => setTimeout(r, 200))
  
  return [section.create('r', { type: 'markdown', content: 'exited' })]
}
`)

    const result = await runRuneInIsolate(runeFile, { allow: ['shell.run:**'], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('exited')
  })
})

describe('runRuneInIsolate — db integration', () => {
  let tmp

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-db-'))
  })

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  it('allows connecting to db and executing queries', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { db, section } from '@utils'
export async function run() {
  const client = await db.connect('postgres://user:pass@mydb.com:5432/production')
  const rows = await client.query('SELECT * FROM users WHERE id = $1', [42])
  const first = await client.get('SELECT * FROM users WHERE id = $1', [42])
  const execResult = await client.exec('UPDATE users SET name = $1 WHERE id = $2', ['Alice', 42])
  await client.close()
  return [section.create('r', { type: 'markdown', content: JSON.stringify({ rows, first, execResult }) })]
}
`)
    const result = await runRuneInIsolate(
      runeFile,
      { allow: ['db.connect:postgres:mydb.com:5432/production'], deny: [] },
      [],
      tmp,
    )
    const parsed = JSON.parse(result[0].data.content)
    expect(parsed.rows).toEqual([{ id: 42, name: 'Alice' }])
    expect(parsed.first).toEqual({ id: 42, name: 'Alice' })
    expect(parsed.execResult).toEqual({ changes: 1 })
  })

  it('supports transactions with BEGIN, COMMIT, and ROLLBACK', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { db, section } from '@utils'
export async function run() {
  const client = await db.connect('postgres://user:pass@mydb.com:5432/production')
  let txRun = false
  const res = await client.transaction(async (tx) => {
    txRun = true
    return await tx.get('SELECT name FROM users WHERE id = $1', [42])
  })
  await client.close()
  return [section.create('r', { type: 'markdown', content: JSON.stringify({ txRun, res }) })]
}
`)
    const result = await runRuneInIsolate(
      runeFile,
      { allow: ['db.connect:postgres:mydb.com:5432/production'], deny: [] },
      [],
      tmp,
    )
    const parsed = JSON.parse(result[0].data.content)
    expect(parsed.txRun).toBe(true)
    expect(parsed.res).toEqual({ id: 42, name: 'Alice' })
  })

  it('throws PermissionError when db.connect is not allowed', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, `
import { db } from '@utils'
export async function run() {
  await db.connect('postgres://user:pass@mydb.com:5432/production')
}
`)
    await expect(
      runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    ).rejects.toThrow()
  })
})

