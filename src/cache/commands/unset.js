import { deleteCacheKey } from '../index.js'
import { ensureProjectIdentity } from '../../project/index.js'

export async function handler({ id, key: keyName, projectDir, global: isGlobal }) {
  const projKey = isGlobal ? undefined : (await ensureProjectIdentity(projectDir)).id
  let result
  try {
    result = await deleteCacheKey(id, keyName, projKey)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
  console.log(`Removed key "${keyName}" from "${result.name}".`)
}
