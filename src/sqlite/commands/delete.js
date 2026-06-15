import * as p from '@clack/prompts'
import { deleteSqliteDb } from '../index.js'

export async function handler({ id, yes, projectDir }) {
  if (!yes) {
    const confirm = await p.confirm({ message: `Delete SQLite database matching "${id}"?` })
    if (p.isCancel(confirm) || !confirm) { p.cancel('Cancelled.'); process.exit(0) }
  }
  let result
  try {
    result = await deleteSqliteDb(id)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
  console.log(`Deleted SQLite database "${result.name}".`)
}
