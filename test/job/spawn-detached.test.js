import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Note on scope: the Windows defect this module exists for — a detached job inheriting
// the spawning process's stdout pipe, so `crunes run <rune> | head` blocks until the job
// dies — cannot be reproduced from vitest. libuv creates non-inheritable pipes, so a
// Node-spawned parent never exhibits it; only a shell-created pipe (bash/cmd) does.
// These tests therefore cover the launch contract the shim has to keep: the real pid,
// a job that actually starts, space-safe arguments, and captured output.

let projectDir
beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'crunes-spawn-detached-'))
})
afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true }).catch(() => {})
})

async function getSpawn() {
  return (await import('../../src/job/spawn-detached.js')).spawnDetachedJob
}

async function waitForFile(path, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { return await readFile(path, 'utf8') } catch { await new Promise(r => setTimeout(r, 100)) }
  }
  return null
}

describe('spawnDetachedJob', () => {
  it('starts the job, reports its real pid, and captures its output', async () => {
    const spawnDetachedJob = await getSpawn()

    // The directory name contains a space: job paths are user project paths, and an
    // argument split on that space silently starts the wrong process.
    const jobDir = join(projectDir, 'job dir')
    await mkdir(jobDir, { recursive: true })
    const childPath = join(jobDir, 'child.mjs')
    const marker = join(jobDir, 'marker.txt')
    const outPath = join(jobDir, 'stdout.log')
    const errPath = join(jobDir, 'stderr.log')

    await writeFile(childPath, `
import { writeFileSync } from 'node:fs'
console.log('hello from job')
writeFileSync(process.env.MARKER, String(process.pid))
setTimeout(() => {}, 30000)
`)

    const { pid } = spawnDetachedJob(process.execPath, [childPath], {
      outPath,
      errPath,
      env: { ...process.env, MARKER: marker },
    })

    try {
      expect(Number.isInteger(pid)).toBe(true)

      // The pid must be the job itself — `job kill` / `job list` target it directly.
      // A launcher that returned an intermediate's pid would fail here.
      expect(await waitForFile(marker), 'job never started').toBe(String(pid))
      expect(() => process.kill(pid, 0)).not.toThrow()

      // Output still has to reach the job log now that the launch is indirect.
      expect(await waitForFile(outPath)).toContain('hello from job')
    } finally {
      try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
    }
  }, 45_000)

  // Shell jobs pass a command string with shell: true rather than an exe plus args.
  it('runs a shell command job and captures its output', async () => {
    const spawnDetachedJob = await getSpawn()
    const outPath = join(projectDir, 'stdout.log')
    const errPath = join(projectDir, 'stderr.log')

    const { pid } = spawnDetachedJob('echo shell-job-ok', [], {
      outPath,
      errPath,
      cwd: projectDir,
      shell: true,
    })

    expect(Number.isInteger(pid)).toBe(true)
    expect(await waitForFile(outPath)).toContain('shell-job-ok')
  }, 45_000)

  // With no env option the job must still inherit a real environment. Spreading an
  // undefined env would hand it an empty one, leaving it without PATH.
  it('inherits the parent environment when none is given', async () => {
    const spawnDetachedJob = await getSpawn()
    const childPath = join(projectDir, 'env-child.mjs')
    const marker = join(projectDir, 'env-marker.txt')

    await writeFile(childPath, `
import { writeFileSync } from 'node:fs'
const path = process.env.PATH ?? process.env.Path ?? ''
writeFileSync(${JSON.stringify(marker)}, path.length > 0 ? 'has-path' : 'NO-PATH')
`)

    const { pid } = spawnDetachedJob(process.execPath, [childPath], {
      outPath: join(projectDir, 'stdout.log'),
      errPath: join(projectDir, 'stderr.log'),
    })

    try {
      expect(await waitForFile(marker)).toBe('has-path')
    } finally {
      try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
    }
  }, 45_000)
})
