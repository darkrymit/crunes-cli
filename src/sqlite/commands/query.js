import { querySqliteDb } from '../index.js'

function pad(s, n) { return String(s ?? '').padEnd(n) }

export async function handler({ id, sql }) {
  let rows
  try {
    rows = await querySqliteDb(id, sql)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
  if (rows.length === 0) {
    console.log('No rows.')
    return
  }
  const cols = Object.keys(rows[0])
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)))
  console.log(cols.map((c, i) => pad(c, widths[i])).join('  '))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const row of rows) {
    console.log(cols.map((c, i) => pad(row[c], widths[i])).join('  '))
  }
}
