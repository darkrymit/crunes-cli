import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolveShell } from '../rune/api/shell-resolve.js'
import { isAlive, jobPgidPath } from './registry.js'

function run(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true })
    child.on('error', resolve)
    child.on('close', resolve)
  })
}

async function readGroup(projectDir, id) {
  const raw = (await readFile(jobPgidPath(projectDir, id), 'utf8').catch(() => '')).trim()
  // Group 1 is never a job, and `kill -- -1` would signal every Git Bash process.
  return /^\d+$/.test(raw) && Number(raw) > 1 ? raw : null
}

/**
 * Kills a Windows shell job with everything it started.
 *
 * `taskkill /T` follows Windows parent pids, and a Git Bash program that execs leaves its
 * child with a dead parent, so the walk misses it. The Git Bash process group survives exec.
 * A group id can be reused once the job is gone, so it is trusted only while the job lives.
 */
export async function killWindowsShellJob(projectDir, record) {
  const group = isAlive(record.pid) ? await readGroup(projectDir, record.id) : null
  if (group) {
    try { await run(resolveShell('bash').path, ['-c', `kill -9 -- -${group}`]) } catch { /* no bash to ask */ }
  }
  await run('taskkill', ['/F', '/T', '/PID', String(record.pid)])
}
