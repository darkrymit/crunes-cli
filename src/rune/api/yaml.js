import path from 'node:path'
import { parseDocument, Document, isMap, isSeq, isScalar, isAlias, Pair } from 'yaml'
import { JSONPath } from 'jsonpath-plus'

class YamlParseError extends Error {
  constructor(message, filePath) {
    super(message)
    this.name = 'YamlParseError'
    this.filePath = filePath
  }
}

function wrapParseError(err, displayPath) {
  throw new YamlParseError(
    `Failed to parse ${displayPath}:\n  ${err.message}`,
    displayPath
  )
}

function trimComment(raw) {
  return raw.split('\n').map(l => l.trim()).join('\n')
}

function docToJs(node) {
  if (node == null) return null
  if (isAlias(node)) return docToJs(node.resolve())
  if (isScalar(node)) return node.value
  if (isSeq(node)) return node.items.map(item => docToJs(item))
  if (isMap(node)) {
    const result = {}
    for (let i = 0; i < node.items.length; i++) {
      const pair = node.items[i]
      const key = isScalar(pair.key) ? pair.key.value : String(pair.key.value)
      if (pair.key?.commentBefore) result[`#comment:${key}`] = trimComment(pair.key.commentBefore)
      if (pair.value?.comment) result[`#inline:${key}`] = pair.value.comment.trim()
      const val = pair.value
      if (isSeq(val)) {
        // yaml package stores comment before item[0] on the seq node itself
        if (val.commentBefore) result[`#comment:${key}[0]`] = trimComment(val.commentBefore)
        for (let j = 1; j < val.items.length; j++) {
          if (val.items[j]?.commentBefore) result[`#comment:${key}[${j}]`] = trimComment(val.items[j].commentBefore)
        }
        if (val.flow) result[`#flow:${key}`] = true
      }
      if (isScalar(val) && val.type && val.type !== 'PLAIN') {
        const styleMap = {
          BLOCK_LITERAL: 'literal',
          BLOCK_FOLDED: 'folded',
          QUOTE_SINGLE: 'single',
          QUOTE_DOUBLE: 'double',
        }
        const style = styleMap[val.type]
        if (style) result[`#style:${key}`] = style
      }
      result[key] = docToJs(val)
    }
    return result
  }
  return null
}

function buildNode(doc, data, arrayItemComments = {}) {
  if (data === null || data === undefined) return doc.createNode(data)
  if (Array.isArray(data)) {
    const seq = doc.createNode([])
    data.forEach((item, i) => {
      const n = buildNode(doc, item)
      if (arrayItemComments[i]) n.commentBefore = ' ' + arrayItemComments[i]
      seq.add(n)
    })
    return seq
  }
  if (typeof data === 'object') {
    const comments = {}
    const inlines = {}
    const styles = {}
    const arrayComments = {}
    const flows = {}

    for (const k of Object.keys(data)) {
      const cm = k.match(/^#comment:([^\[]+)$/)
      if (cm) { comments[cm[1]] = data[k]; continue }
      const ci = k.match(/^#comment:([^\[]+)\[(\d+)\]$/)
      if (ci) {
        arrayComments[ci[1]] = arrayComments[ci[1]] || {}
        arrayComments[ci[1]][Number(ci[2])] = data[k]
        continue
      }
      const il = k.match(/^#inline:(.+)$/)
      if (il) { inlines[il[1]] = data[k]; continue }
      const st = k.match(/^#style:(.+)$/)
      if (st) { styles[st[1]] = data[k]; continue }
      const fl = k.match(/^#flow:(.+)$/)
      if (fl) { flows[fl[1]] = data[k]; continue }
    }

    const map = doc.createNode({})

    for (const k of Object.keys(data)) {
      if (k.startsWith('#')) continue
      const keyNode = doc.createNode(k)
      if (comments[k]) keyNode.commentBefore = ' ' + comments[k].split('\n').join('\n ')
      const valNode = buildNode(doc, data[k], arrayComments[k] || {})
      if (flows[k] && isSeq(valNode)) valNode.flow = true
      if (inlines[k]) valNode.comment = ' ' + inlines[k]
      if (styles[k] && isScalar(valNode)) {
        const styleMap = {
          literal: 'BLOCK_LITERAL',
          folded: 'BLOCK_FOLDED',
          single: 'QUOTE_SINGLE',
          double: 'QUOTE_DOUBLE',
          plain: 'PLAIN',
        }
        if (styleMap[styles[k]]) valNode.type = styleMap[styles[k]]
      }
      map.add(new Pair(keyNode, valNode))
    }
    return map
  }
  return doc.createNode(data)
}

export function parseYaml(text, displayPath = '<string>') {
  let doc
  try { doc = parseDocument(text) } catch (err) { wrapParseError(err, displayPath) }
  if (doc.errors.length > 0) wrapParseError(doc.errors[0], displayPath)
  const result = docToJs(doc.contents)
  const head = doc.commentBefore?.trim()
  if (head && result && typeof result === 'object' && !Array.isArray(result)) result['#head'] = head
  const tail = doc.comment?.trim()
  if (tail && result && typeof result === 'object' && !Array.isArray(result)) result['#tail'] = tail
  return result
}

export function stringifyYaml(data, { indent = 2 } = {}) {
  const doc = new Document()
  let head = null
  let tail = null
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    head = data['#head']
    tail = data['#tail']
  }
  doc.contents = buildNode(doc, data)
  if (head) doc.commentBefore = ' ' + head
  if (tail) doc.comment = ' ' + tail
  const content = doc.toString({ indent, nullStr: '' })
  return content.endsWith('\n') ? content : content + '\n'
}

export function createYamlUtils(dir, fsUtils) {
  return {
    parse: parseYaml,
    stringify: stringifyYaml,

    async read(relPath, { throw: shouldThrow = true } = {}) {
      const text = await fsUtils.read(relPath, { throw: shouldThrow })
      if (text === null) return null
      return parseYaml(text, path.join(dir, relPath))
    },

    async write(relPath, data, { indent = 2 } = {}) {
      const content = stringifyYaml(data, { indent })
      await fsUtils.write(relPath, content)
    },

    async modify(relPath, callback, { initial, indent = 2 } = {}) {
      const missing = !(await fsUtils.exists(relPath))
      if (missing && initial === undefined) {
        await this.read(relPath)
      }
      const data = missing
        ? structuredClone(initial)
        : await this.read(relPath)
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
      if (missing && value === undefined) return

      const data = missing ? {} : await this.read(relPath)

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
