import { listSchemaCaches } from '../../schema-cache.js'

function pad(s, n) { return String(s ?? '-').padEnd(n) }

export async function handler({ projectDir }) {
  const entries = await listSchemaCaches(projectDir)

  if (entries.length === 0) {
    console.log('No schema cache entries.')
    return
  }

  const cols = ['RUNE KEY', 'TYPE', 'CACHED AT', 'HASH']
  const rows = entries.map(e => [
    e.runeKey,
    e.type,
    new Date(e.cachedAt).toLocaleString(),
    e.hash.slice(0, 12) + '...',
  ])
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i] ?? '').length)))
  console.log(cols.map((c, i) => pad(c, widths[i])).join('  '))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '))
  }
}
