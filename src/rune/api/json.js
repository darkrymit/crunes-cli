import path from 'node:path'
import { JSONPath } from 'jsonpath-plus'

class JsonParseError extends Error {
  constructor(message, filePath) {
    super(message)
    this.name = 'JsonParseError'
    this.filePath = filePath
  }
}

function parseJson(text, displayPath) {
  try {
    return JSON.parse(text)
  } catch (err) {
    const posMatch = err.message.match(/position (\d+)/)
    let location = ''
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10)
      const lines = text.slice(0, pos).split('\n')
      const line = lines.length
      const col = lines[lines.length - 1].length + 1
      location = ` at line ${line}, column ${col}`
    }
    throw new JsonParseError(
      `Failed to parse ${displayPath}:\n  ${err.message}${location}`,
      displayPath
    )
  }
}

export function createJsonUtils(dir, fsUtils) {
  return {
    async read(relPath, { throw: shouldThrow = true } = {}) {
      const text = await fsUtils.read(relPath, { throw: shouldThrow })
      if (text === null) return null
      return parseJson(text, path.join(dir, relPath))
    },

    async get(relPath, jsonPath, defaultValue = undefined) {
      const obj = await this.read(relPath, { throw: false })
      if (obj === null) return defaultValue
      const results = JSONPath({ path: jsonPath, json: obj, wrap: true })
      return results.length === 0 ? defaultValue : results[0]
    },

    async getAll(relPath, jsonPath, defaultValue = []) {
      const obj = await this.read(relPath, { throw: false })
      if (obj === null) return defaultValue
      const results = JSONPath({ path: jsonPath, json: obj, wrap: true })
      return results.length === 0 ? defaultValue : results
    },
  }
}
