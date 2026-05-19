import path from 'node:path'
import yaml from 'js-yaml'

class YamlParseError extends Error {
  constructor(message, filePath) {
    super(message)
    this.name = 'YamlParseError'
    this.filePath = filePath
  }
}

function parseYaml(text, displayPath) {
  try {
    return yaml.load(text)
  } catch (err) {
    const line = err.mark?.line != null ? err.mark.line + 1 : null
    const col  = err.mark?.column != null ? err.mark.column + 1 : null
    const loc  = line != null ? ` at line ${line}, column ${col}` : ''
    throw new YamlParseError(
      `Failed to parse ${displayPath}:\n  ${err.reason ?? err.message}${loc}`,
      displayPath
    )
  }
}

export function createYamlUtils(dir, fsUtils) {
  return {
    async read(relPath, { throw: shouldThrow = true } = {}) {
      const text = await fsUtils.read(relPath, { throw: shouldThrow })
      if (text === null) return null
      return parseYaml(text, path.join(dir, relPath))
    },

    async write(relPath, data, { indent = 2 } = {}) {
      const content = yaml.dump(data, { indent, lineWidth: -1, noRefs: true })
      await fsUtils.write(relPath, content)
    },

    async modify(relPath, callback, { initial, indent = 2 } = {}) {
      const missing = !(await fsUtils.exists(relPath))
      if (missing && initial === undefined) {
        await this.read(relPath)
      }
      const data = missing ? structuredClone(initial) : await this.read(relPath)
      const result = await callback(data, { exists: !missing })
      await this.write(relPath, result !== undefined ? result : data, { indent })
    },
  }
}
