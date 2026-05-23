import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { getStorePath } from '../store/index.js'
import { upsertProject } from '../project/index.js'

export function projectKey(projectDir) {
  return createHash('sha256').update(projectDir).digest('hex').slice(0, 12)
}

function jobsBase()          { return join(getStorePath(), 'jobs') }
function projectJobsDir(key) { return join(jobsBase(), 'project', key) }
function jobPath(key, id)    { return join(projectJobsDir(key), `${id}.json`) }

export async function createJob(pid, { type = 'rune', spawnedBy, runeKey, projectDir, args = [] } = {}) {
  const key = projectKey(projectDir)
  const id  = randomUUID()
  const record = { id, type, pid, startedAt: new Date().toISOString(), projectKey: key, projectDir, spawnedBy, runeKey, args }
  await mkdir(projectJobsDir(key), { recursive: true })
  await writeFile(jobPath(key, id), JSON.stringify(record, null, 2), 'utf8')
  await upsertProject(key, projectDir)
  return { id, projectKey: key }
}

export async function getJob(key, id) {
  try {
    const raw = await readFile(jobPath(key, id), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function listJobs(key) {
  if (key) {
    let files
    try { files = await readdir(projectJobsDir(key)) } catch { return [] }
    const records = await Promise.all(
      files.filter(f => f.endsWith('.json')).map(f => getJob(key, f.slice(0, -5)))
    )
    return records.filter(Boolean)
  }
  let keys
  try { keys = await readdir(join(jobsBase(), 'project')) } catch { return [] }
  const all = await Promise.all(keys.map(k => listJobs(k)))
  return all.flat()
}

export async function deleteJob(key, id) {
  await rm(jobPath(key, id), { force: true })
}

export async function cleanJobs(key) {
  const dir = key ? projectJobsDir(key) : join(jobsBase(), 'project')
  let entries
  try { entries = await readdir(dir) } catch { return }

  if (key) {
    await Promise.all(
      entries
        .filter(f => f.endsWith('.json'))
        .map(async f => {
          const id = f.slice(0, -5)
          const record = await getJob(key, id)
          if (!record) return
          if (!isAlive(record.pid)) await rm(jobPath(key, id), { force: true })
        })
    )
  } else {
    await Promise.all(entries.map(k => cleanJobs(k)))
  }
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
