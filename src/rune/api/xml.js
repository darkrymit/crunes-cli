import path from 'node:path'
import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser'

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

function parseXml(text, displayPath) {
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

export function createXmlUtils(dir, fsUtils) {
  return {
    async read(relPath, { throw: shouldThrow = true } = {}) {
      const text = await fsUtils.read(relPath, { throw: shouldThrow })
      if (text === null) return null
      return parseXml(text, path.join(dir, relPath))
    },

    async write(relPath, data, { indent = 2 } = {}) {
      const builder = new XMLBuilder({
        ...PARSER_OPTS,
        format: true,
        indentBy: ' '.repeat(indent),
        suppressEmptyNode: true,
      })
      const content = builder.build(data)
      await fsUtils.write(relPath, content.endsWith('\n') ? content : content + '\n')
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
