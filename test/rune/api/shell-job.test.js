import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join, sep } from 'node:path'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { jobStdoutPath, jobStderrPath, getJob } from '../../../src/job/registry.js'
import { handler as killHandler } from '../../../src/job/commands/kill.js'
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js'

describe('shell job log paths', () => {
  it('stdout path contains stdout.log', () => {
    const p = jobStdoutPath('/myproject', 'job-123')
    expect(p).toMatch(/stdout\.log$/)
    expect(p).toContain('job-123')
  })

  it('stderr path contains stderr.log', () => {
    const p = jobStderrPath('/myproject', 'job-123')
    expect(p).toMatch(/stderr\.log$/)
    expect(p).toContain('job-123')
  })

  it('stdout and stderr paths are in the same directory', () => {
    const stdout = jobStdoutPath('/myproject', 'job-123')
    const stderr = jobStderrPath('/myproject', 'job-123')
    expect(stdout.replace('stdout.log', '')).toBe(stderr.replace('stderr.log', ''))
  })
})

describe('killing a shell job ends the processes it started', () => {
  // The last shape is what mvnw does: exec a second script, which execs the program.
  const SHAPES = { 'as a child': 'CHILD; true', 'through exec': 'exec CHILD', 'through an exec of a second script': 'exec sh hop.sh' }
  let tmp, store, childPid

  beforeEach(async () => {
    tmp   = await mkdtemp(join(tmpdir(), 'crunes-shell-job-'))
    store = await mkdtemp(join(tmpdir(), 'crunes-shell-job-store-'))
    process.env.CRUNES_STORE = store
    childPid = null
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    if (childPid) { try { process.kill(childPid, 'SIGKILL') } catch { /* already gone */ } }
    delete process.env.CRUNES_STORE
    for (const dir of [tmp, store]) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }, 30_000)

  async function until(probe, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const value = await probe()
      if (value) return value
      await new Promise(r => setTimeout(r, 100))
    }
    return null
  }

  const gone = pid => { try { process.kill(pid, 0); return false } catch { return true } }

  async function runRune(body) {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { shell, section } from "@utils"',
      'export async function run() {',
      `  ${body}`,
      '}',
    ].join('\n'))
    const allow = ['shell.job.start:sh run.sh', 'shell.run:sh run.sh', 'shell.job.kill']
    const [result] = await runRuneInIsolate(runeFile, { allow, deny: [] }, [], tmp)
    return result.data.content
  }

  async function startJob(shape) {
    const slash = p => p.split(sep).join('/')
    await writeFile(join(tmp, 'child.mjs'), [
      'import { writeFileSync } from "node:fs"',
      'writeFileSync("child.pid", String(process.pid))',
      'setTimeout(() => {}, 30000)',
    ].join('\n'))
    const child = `"${slash(process.execPath)}" child.mjs`
    await writeFile(join(tmp, 'run.sh'), shape.replace('CHILD', child) + '\n')
    await writeFile(join(tmp, 'hop.sh'), `exec ${child}\n`)
    const id = await runRune('const { id } = await shell.job.start("sh run.sh", { repl: true }); return [section.create("x", { type: "markdown", content: id })]')
    const pid = await until(() => readFile(join(tmp, 'child.pid'), 'utf8').catch(() => null))
    expect(pid, 'the job never started its child').not.toBeNull()
    childPid = Number(pid)
    expect(gone(childPid)).toBe(false)
    return id
  }

  for (const [name, shape] of Object.entries(SHAPES)) {
    it(`shell.job.kill reaches a program run ${name}`, async () => {
      const id = await startJob(shape)
      await runRune(`await shell.job.kill(${JSON.stringify(id)}); return [section.create("x", { type: "markdown", content: "ok" })]`)
      expect(await until(() => gone(childPid)), 'the child outlived the kill').toBe(true)
    }, 45_000)

    it.runIf(process.platform === 'win32')(`crunes job kill reaches a program run ${name}`, async () => {
      const id = await startJob(shape)
      vi.spyOn(console, 'log').mockImplementation(() => {})
      await killHandler({ id, projectDir: tmp })
      expect(await until(() => gone(childPid)), 'the child outlived the kill').toBe(true)
      expect(await getJob(tmp, id)).toBeNull()
    }, 45_000)
  }
})
