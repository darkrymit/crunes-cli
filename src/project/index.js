import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getProjectsJsonPath } from '../store/index.js'

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
