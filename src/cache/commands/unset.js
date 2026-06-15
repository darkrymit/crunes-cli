import { deleteCacheKey } from '../index.js'

export async function handler({ id, key: keyName, projectDir }) {
  let result
  try {
    result = await deleteCacheKey(id, keyName)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
  console.log(`Removed key "${keyName}" from "${result.name}".`)
}
