import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { getProjectsJsonPath } from '../store/index.js'

export function shortHash(str) {
  return createHash('sha1').update(str).digest('hex').slice(0, 8)
}

export async function ensureProjectIdentity(dir) {
  const localJsonPath = path.join(dir, '.crunes', 'project.local.json')
  try {
    const raw = await readFile(localJsonPath, 'utf8')
    return JSON.parse(raw)
  } catch {}

  let alias = path.basename(dir)
  try {
    const config = JSON.parse(await readFile(path.join(dir, '.crunes', 'config.json'), 'utf8'))
    if (typeof config.name === 'string' && config.name.length > 0) alias = config.name
  } catch {}

  const id = `${path.basename(dir).slice(0, 15)}-${shortHash(dir + '-' + Math.random())}`
  const identity = { id, alias }
  await mkdir(path.join(dir, '.crunes'), { recursive: true })
  await writeFile(localJsonPath, JSON.stringify(identity, null, 2), 'utf8')
  return identity
}

export async function getProjectKey(dir, name = undefined) {
  if (typeof name === 'string' && name.length > 0) return `${name}-${shortHash(dir)}`
  try {
    const raw = await readFile(path.join(dir, '.crunes', 'project.local.json'), 'utf8')
    const { id } = JSON.parse(raw)
    if (typeof id === 'string' && id.length > 0) return id
  } catch {}
  return shortHash(dir)
}

export async function loadProjects() {
  try {
    const raw = await readFile(getProjectsJsonPath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return { format: '1', projects: {} }
  }
}

export async function upsertProject(id, projectDir) {
  const data = await loadProjects()
  let alias = path.basename(projectDir)
  try {
    const raw = await readFile(path.join(projectDir, '.crunes', 'project.local.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (typeof parsed.alias === 'string' && parsed.alias.length > 0) alias = parsed.alias
  } catch {}
  const existing = data.projects[id]
  data.projects[id] = {
    path: projectDir,
    alias,
    lastActiveAt: new Date().toISOString(),
    firstSeenAt: existing?.firstSeenAt ?? new Date().toISOString(),
  }
  const p = getProjectsJsonPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(data, null, 2), 'utf8')
}
