import path from 'node:path'
import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser'
import { JSONPath } from 'jsonpath-plus'

const PARSER_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  commentPropName: '#comment',
  cdataPropName: '#cdata',
  isArray: (name) => name === '#comment',
}

class XmlParseError extends Error {
  constructor(message, filePath) {
    super(message)
    this.name = 'XmlParseError'
    this.filePath = filePath
  }
}

export function parseXml(text, displayPath = '<string>') {
  const validation = XMLValidator.validate(text)
  if (validation !== true) {
    const { err } = validation
    const loc = err.line != null ? ` at line ${err.line}, column ${err.col}` : ''
    throw new XmlParseError(
      `Failed to parse ${displayPath}:\n  ${err.msg}${loc}`,
      displayPath
    )
  }
  return new XMLParser(PARSER_OPTS).parse(text)
}

export function stringifyXml(data, { indent = 2 } = {}) {
  const builder = new XMLBuilder({
    ...PARSER_OPTS,
    format: true,
    indentBy: ' '.repeat(indent),
    suppressEmptyNode: true,
  })
  const content = builder.build(data)
  return content.endsWith('\n') ? content : content + '\n'
}

export function createXmlUtils(dir, fsUtils) {
  return {
    parse: parseXml,
    stringify: stringifyXml,

    async read(relPath, { throw: shouldThrow = true } = {}) {
      const text = await fsUtils.read(relPath, { throw: shouldThrow })
      if (text === null) return null
      return parseXml(text, path.join(dir, relPath))
    },

    async write(relPath, data, { indent = 2 } = {}) {
      await fsUtils.write(relPath, stringifyXml(data, { indent }))
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

    async readPath(relPath, jsonPath, fallback = undefined) {
      const obj = await this.read(relPath, { throw: false })
      if (obj === null) return fallback
      const results = JSONPath({ path: jsonPath, json: obj, wrap: true })
      return results.length === 0 ? fallback : results[0]
    },

    async readPathAll(relPath, jsonPath, fallback = []) {
      const obj = await this.read(relPath, { throw: false })
      if (obj === null) return fallback
      const results = JSONPath({ path: jsonPath, json: obj, wrap: true })
      return results.length === 0 ? fallback : results
    },

    async writePath(relPath, jsonPath, value, { indent = 2 } = {}) {
      const missing = !(await fsUtils.exists(relPath))
      if (missing) throw new XmlParseError(
        `Cannot writePath on missing XML file: ${relPath}. Use modify+initial to create XML files from scratch.`,
        relPath
      )

      const data = await this.read(relPath)

      let matched = false
      JSONPath({
        path: jsonPath,
        json: data,
        resultType: 'all',
        callback(_, __, payload) {
          if (value === undefined) {
            delete payload.parent[payload.parentProperty]
          } else {
            payload.parent[payload.parentProperty] = value
          }
          matched = true
        },
      })

      if (!matched && value !== undefined) {
        const segments = jsonPath
          .replace(/^\$\.?/, '')
          .split(/\.|\[(\d+)\]/)
          .filter(s => s != null && s !== '')
        let node = data
        for (let i = 0; i < segments.length - 1; i++) {
          const seg = segments[i]
          if (node[seg] == null || typeof node[seg] !== 'object') node[seg] = {}
          node = node[seg]
        }
        node[segments[segments.length - 1]] = value
      }

      await this.write(relPath, data, { indent })
    },
  }
}
