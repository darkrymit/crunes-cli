import { readFileSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { getProjectsJsonPath } from '../store/index.js'

export function shortHash(str) {
  return createHash('sha1').update(str).digest('hex').slice(0, 8)
}

export function getProjectKey(dir, name = undefined) {
  const hash = shortHash(dir)
  if (typeof name === 'string' && name.length > 0) return `${name}-${hash}`
  try {
    const config = JSON.parse(readFileSync(path.join(dir, '.crunes', 'config.json'), 'utf8'))
    const n = config.name
    if (typeof n === 'string' && n.length > 0) return `${n}-${hash}`
  } catch {}
  return hash
}

export async function loadProjects() {
  try {
    const raw = await readFile(getProjectsJsonPath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return { format: '1', projects: {} }
  }
}

export async function upsertProject(key, projectDir) {
  const data = await loadProjects()
  data.projects[key] = projectDir
  const p = getProjectsJsonPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(data, null, 2), 'utf8')
}
