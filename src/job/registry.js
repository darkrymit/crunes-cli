import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

function jobDir(projectDir, id)    { return join(projectDir, '.crunes', 'jobs', id) }

export function jobStdoutPath(projectDir, id) { return join(jobDir(projectDir, id), 'stdout.log') }
export function jobStderrPath(projectDir, id) { return join(jobDir(projectDir, id), 'stderr.log') }
export function jobStdinPath(projectDir, id)  { return join(jobDir(projectDir, id), 'stdin.log') }

export async function updateJobPid(projectDir, id, pid) {
  const record = await getJob(projectDir, id)
  if (!record) return
  record.pid = pid
  await writeFile(join(jobDir(projectDir, id), 'job.json'), JSON.stringify(record, null, 2), 'utf8')
}

export async function createJob(pid, { type = 'rune', spawnedBy, runeKey, projectDir, args = [] } = {}) {
  const id = randomUUID()
  const record = { id, type, pid, startedAt: new Date().toISOString(), projectDir, spawnedBy, runeKey, args }
  const dir = jobDir(projectDir, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'job.json'), JSON.stringify(record, null, 2), 'utf8')
  return { id }
}

export async function getJob(projectDir, id) {
  try {
    const raw = await readFile(join(jobDir(projectDir, id), 'job.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function listJobs(projectDir) {
  const base = join(projectDir, '.crunes', 'jobs')
  let entries
  try { entries = await readdir(base, { withFileTypes: true }) } catch { return [] }
  const records = await Promise.all(
    entries.filter(e => e.isDirectory()).map(e => getJob(projectDir, e.name))
  )
  return records.filter(Boolean)
}

export async function deleteJob(projectDir, id) {
  await rm(jobDir(projectDir, id), { recursive: true, force: true })
}

export async function cleanJobs(projectDir) {
  const base = join(projectDir, '.crunes', 'jobs')
  let entries
  try { entries = await readdir(base, { withFileTypes: true }) } catch { return }
  await Promise.all(
    entries
      .filter(e => e.isDirectory())
      .map(async e => {
        const record = await getJob(projectDir, e.name)
        if (!record) return
        if (!isAlive(record.pid)) await rm(jobDir(projectDir, e.name), { recursive: true, force: true })
      })
  )
}

export function resolveJobId(id, jobs) {
  const exact = jobs.find(j => j.id === id)
  if (exact) return exact.id
  const matches = jobs.filter(j => j.id.startsWith(id))
  if (matches.length === 1) return matches[0].id
  if (matches.length === 0) throw new Error(`No job matching "${id}".`)
  throw new Error(`Ambiguous id "${id}" — matches: ${matches.map(j => j.id).join(', ')}.`)
}

export function isAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}
