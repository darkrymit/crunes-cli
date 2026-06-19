import path from 'node:path'
import { createRequire } from 'node:module'
import { JSONPath } from 'jsonpath-plus'
import JSON5 from 'json5'

const _require = createRequire(import.meta.url)
const commentJson = _require('comment-json/src/index.js')

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

const EXT_FORMAT = { '.json': 'json', '.jsonc': 'jsonc', '.json5': 'json5' }

export function detectFormat(relPath, override) {
  if (override) return override
  const ext = relPath.slice(relPath.lastIndexOf('.')).toLowerCase()
  return EXT_FORMAT[ext] ?? 'json'
}

// comment-json Symbol keys
const SYM_HEAD    = Symbol.for('before-all')
const SYM_TAIL    = Symbol.for('after-all')
const symBefore   = k => Symbol.for(`before:${k}`)
// inline comments: `after-value:key` for non-last props, `after:key` for the last prop
const symInlineNonLast = k => Symbol.for(`after-value:${k}`)
const symInlineLast    = k => Symbol.for(`after:${k}`)

export function parseJsonc(text, displayPath) {
  let parsed
  try {
    parsed = commentJson.parse(text)
  } catch (err) {
    throw new JsonParseError(`Failed to parse ${displayPath}:\n  ${err.message}`, displayPath)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed

  const result = {}

  const head = parsed[SYM_HEAD]
  if (head?.length) result['#head'] = head.filter(c => c.type !== 'BlankLine').map(c => c.value.trim()).join('\n')
  const tail = parsed[SYM_TAIL]
  if (tail?.length) result['#tail'] = tail.filter(c => c.type !== 'BlankLine').map(c => c.value.trim()).join('\n')

  for (const key of Object.keys(parsed)) {
    const before = parsed[symBefore(key)]
    if (before?.length) result[`#comment:${key}`] = before.filter(c => c.type !== 'BlankLine').map(c => c.value.trim()).join('\n')
    const inlineNonLast = parsed[symInlineNonLast(key)]
    const inlineLast    = parsed[symInlineLast(key)]
    const inlineComments = inlineNonLast ?? inlineLast
    if (inlineComments?.length) result[`#inline:${key}`] = inlineComments.filter(c => c.type !== 'BlankLine').map(c => c.value.trim()).join('\n')
    result[key] = parsed[key]
  }
  return result
}

export function stringifyJsonc(data, spaces) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    const out = commentJson.stringify(data, null, spaces)
    return out.endsWith('\n') ? out : out + '\n'
  }

  const obj = commentJson.parse('{}')
  const head = data['#head']
  const tail = data['#tail']

  const keys = Object.keys(data).filter(k => !k.startsWith('#'))
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    obj[key] = data[key]
    const before = data[`#comment:${key}`]
    if (before) obj[symBefore(key)] = before.split('\n').map(line => ({ type: 'LineComment', value: ` ${line}` }))
    const inline = data[`#inline:${key}`]
    if (inline) {
      const inlineSym = i === keys.length - 1 ? symInlineLast(key) : symInlineNonLast(key)
      obj[inlineSym] = [{ type: 'LineComment', value: ` ${inline}`, inline: true }]
    }
  }

  if (head) obj[SYM_HEAD] = head.split('\n').map(line => ({ type: 'LineComment', value: ` ${line}` }))
  if (tail) obj[SYM_TAIL] = tail.split('\n').map(line => ({ type: 'LineComment', value: ` ${line}` }))

  const out = commentJson.stringify(obj, null, spaces)
  return out.endsWith('\n') ? out : out + '\n'
}

export function parseJson5(text, displayPath) {
  try {
    return JSON5.parse(text)
  } catch (err) {
    throw new JsonParseError(`Failed to parse ${displayPath}:\n  ${err.message}`, displayPath)
  }
}

export function stringifyJson5(data, spaces) {
  const out = JSON5.stringify(data, null, spaces)
  return out.endsWith('\n') ? out : out + '\n'
}

function _parse(text, format, displayPath) {
  if (format === 'jsonc') return parseJsonc(text, displayPath)
  if (format === 'json5') return parseJson5(text, displayPath)
  return parseJson(text, displayPath)
}

function _stringify(data, format, spaces) {
  if (format === 'jsonc') return stringifyJsonc(data, spaces)
  if (format === 'json5') return stringifyJson5(data, spaces)
  return JSON.stringify(data, null, spaces) + '\n'
}

export function createJsonUtils(dir, fsUtils) {
  return {
    async read(relPath, { throw: shouldThrow = true, format } = {}) {
      const text = await fsUtils.read(relPath, { throw: shouldThrow })
      if (text === null) return null
      const fmt = detectFormat(relPath, format)
      return _parse(text, fmt, path.join(dir, relPath))
    },

    async readPath(relPath, jsonPath, fallback = undefined, { format } = {}) {
      const obj = await this.read(relPath, { throw: false, format })
      if (obj === null) return fallback
      const results = JSONPath({ path: jsonPath, json: obj, wrap: true })
      return results.length === 0 ? fallback : results[0]
    },

    async readPathAll(relPath, jsonPath, fallback = [], { format } = {}) {
      const obj = await this.read(relPath, { throw: false, format })
      if (obj === null) return fallback
      const results = JSONPath({ path: jsonPath, json: obj, wrap: true })
      return results.length === 0 ? fallback : results
    },

    async write(relPath, data, { spaces = 2, format } = {}) {
      const fmt = detectFormat(relPath, format)
      const content = _stringify(data, fmt, spaces)
      await fsUtils.write(relPath, content)
    },

    async modify(relPath, callback, { initial, spaces = 2, format } = {}) {
      const missing = !(await fsUtils.exists(relPath))
      if (missing && initial === undefined) {
        await this.read(relPath, { format })
      }
      const data = missing ? structuredClone(initial) : await this.read(relPath, { format })
      const result = await callback(data, { exists: !missing })
      await this.write(relPath, result !== undefined ? result : data, { spaces, format })
    },

    async writePath(relPath, jsonPath, value, { spaces = 2, format } = {}) {
      const missing = !(await fsUtils.exists(relPath))
      if (missing && value === undefined) return

      const data = missing ? {} : await this.read(relPath, { format })

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

      await this.write(relPath, data, { spaces, format })
    },
  }
}
