import { deleteCacheKey } from '../index.js'

export async function handler({ id, key }) {
  let result
  try {
    result = await deleteCacheKey(id, key)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
  console.log(`Removed key "${key}" from "${result.name}".`)
}
