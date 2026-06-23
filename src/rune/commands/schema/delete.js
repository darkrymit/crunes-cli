import { deleteSchemaCache, listSchemaCaches } from '../../schema-cache.js'
import { output } from '../../../shared/output.js'

export async function handler({ runeKey, projectDir }) {
  const before = await listSchemaCaches(projectDir)
  const matching = before.filter(e => e.runeKey === runeKey)
  if (matching.length === 0) {
    output.warn(`No schema cache entries found for "${runeKey}".`)
    return
  }
  await deleteSchemaCache(runeKey, projectDir)
  console.log(`Deleted ${matching.length} schema cache file(s) for "${runeKey}".`)
}
