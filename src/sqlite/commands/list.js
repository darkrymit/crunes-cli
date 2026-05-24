import { listSqliteDbs } from '../index.js'
import { getProjectKey, loadProjects } from '../../project/index.js'

function pad(s, n) { return String(s ?? '-').padEnd(n) }

export async function handler({ projectDir, global: isGlobal }) {
  const key = isGlobal ? undefined : getProjectKey(projectDir)
  const dbs = await listSqliteDbs(key)

  let projectPaths = {}
  if (isGlobal) {
    const { projects } = await loadProjects()
    projectPaths = projects
  }

  if (dbs.length === 0) {
    console.log('No SQLite databases.')
    return
  }

  function projectPlugin(entry) {
    if (entry.scope === 'project') {
      return projectPaths[entry.projectKey] ?? entry.projectKey ?? '-'
    }
    if (entry.scope === 'plugin') return entry.pluginId ?? '-'
    if (entry.scope === 'project-plugin') {
      const proj = projectPaths[entry.projectKey] ?? entry.projectKey
      return `${proj}/${entry.pluginId}`
    }
    return '-'
  }

  const cols = ['KEY', 'NAME', 'SCOPE', 'PROJECT/PLUGIN', 'FIRST SEEN']
  const rows = dbs.map(d => [
    d.key,
    d.name,
    d.scope,
    projectPlugin(d),
    new Date(d.firstSeenAt).toLocaleString(),
  ])
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i] ?? '').length)))
  console.log(cols.map((c, i) => pad(c, widths[i])).join('  '))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '))
  }
}
