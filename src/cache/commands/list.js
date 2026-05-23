import { listCacheBuckets } from '../index.js'

function pad(s, n) { return String(s ?? '-').padEnd(n) }

function projectPlugin(entry) {
  if (entry.scope === 'project') return entry.projectKey ?? '-'
  if (entry.scope === 'plugin') return entry.pluginId ?? '-'
  if (entry.scope === 'project-plugin') return `${entry.projectKey}/${entry.pluginId}`
  return '-'
}

export async function handler() {
  const buckets = await listCacheBuckets()
  if (buckets.length === 0) {
    console.log('No cache buckets.')
    return
  }
  const cols = ['KEY', 'NAME', 'SCOPE', 'PROJECT/PLUGIN', 'FIRST SEEN']
  const rows = buckets.map(b => [
    b.key,
    b.name,
    b.scope,
    projectPlugin(b),
    new Date(b.firstSeenAt).toLocaleString(),
  ])
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i] ?? '').length)))
  console.log(cols.map((c, i) => pad(c, widths[i])).join('  '))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '))
  }
}
