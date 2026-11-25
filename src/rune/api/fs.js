import fsPromises from 'node:fs/promises'
import { createReadStream, createWriteStream, realpathSync } from 'node:fs'
import path from 'node:path'
import { glob } from 'tinyglobby'
import { createRequire } from 'node:module'
import picomatch from 'picomatch'
import { resolvePath } from './utils.js'

const require = createRequire(import.meta.url)
let _chokidar
function getChokidar() {
  if (!_chokidar) _chokidar = require('chokidar')
  return _chokidar
}

function stripBom(str) {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str
}

function realPathOr(p) {
  try { return realpathSync.native(p) } catch { return p }
}

function sliceLines(content, from, to) {
  if (from == null && to == null) return content
  const hadTrailing = content.endsWith('\n')
  const lines = hadTrailing ? content.slice(0, -1).split('\n') : content.split('\n')
  const len = lines.length
  const start = from == null ? 0 : from >= 0 ? from - 1 : Math.max(0, len + from)
  const end   = to   == null ? len : to >= 0 ? to : Math.max(0, len + to + 1)
  const sliced = lines.slice(start, end)
  if (sliced.length === 0) return ''
  return sliced.join('\n') + (hadTrailing ? '\n' : '')
}

const RANGE_CHUNK_BYTES = 64 * 1024

/** Bytes of the last `count` lines, read backwards; `whole` when that is the entire file. */
async function readTailBytes(handle, size, count) {
  const chunks = []
  let pos = size
  let seen = 0
  while (pos > 0) {
    const length = Math.min(RANGE_CHUNK_BYTES, pos)
    pos -= length
    const chunk = Buffer.alloc(length)
    const { bytesRead } = await handle.read(chunk, 0, length, pos)
    if (bytesRead !== length) return null
    // A newline that ends the file closes the last line; it does not start another.
    let at = pos + length === size && chunk[length - 1] === 0x0a ? length - 1 : length
    while (at > 0 && (at = chunk.lastIndexOf(0x0a, at - 1)) !== -1) {
      if (++seen === count) {
        chunks.unshift(chunk.subarray(at + 1))
        return { bytes: Buffer.concat(chunks), whole: false }
      }
    }
    chunks.unshift(chunk)
  }
  return { bytes: Buffer.concat(chunks), whole: true }
}

/** Bytes of the first `count` lines without the last line's newline; `whole` when the file has fewer. */
async function readHeadBytes(handle, size, count) {
  const chunks = []
  let pos = 0
  let seen = 0
  while (pos < size) {
    const length = Math.min(RANGE_CHUNK_BYTES, size - pos)
    const chunk = Buffer.alloc(length)
    const { bytesRead } = await handle.read(chunk, 0, length, pos)
    if (bytesRead !== length) return null
    pos += length
    let at = -1
    while ((at = chunk.indexOf(0x0a, at + 1)) !== -1) {
      if (++seen === count) {
        chunks.push(chunk.subarray(0, at))
        return { bytes: Buffer.concat(chunks), whole: false }
      }
    }
    chunks.push(chunk)
  }
  return { bytes: Buffer.concat(chunks), whole: true }
}

/**
 * Reads a leading or trailing line range without loading the rest of the file. Returns undefined
 * when the range or file needs the plain path. Must return exactly what sliceLines would.
 */
async function readEdgeLines(abs, from, to) {
  const isTail = Number.isInteger(from) && from < 0 && to == null
  const isHead = Number.isInteger(to) && to >= 1 && (from == null || (Number.isInteger(from) && from >= 1))
  if (!isTail && !isHead) return undefined
  const handle = await fsPromises.open(abs, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size === 0) return undefined
    const part = isTail ? await readTailBytes(handle, stat.size, -from) : await readHeadBytes(handle, stat.size, to)
    if (!part) return undefined
    if (part.whole) return sliceLines(stripBom(part.bytes.toString('utf8')), from, to)
    if (isTail) return part.bytes.toString('utf8')
    const last = Buffer.alloc(1)
    await handle.read(last, 0, 1, stat.size - 1)
    const lines = stripBom(part.bytes.toString('utf8')).split('\n').slice(from == null ? 0 : from - 1)
    if (lines.length === 0) return ''
    return lines.join('\n') + (last[0] === 0x0a ? '\n' : '')
  } finally {
    await handle.close()
  }
}

const LINE_BATCH_BYTES = 256 * 1024

// Lines are split on raw bytes and decoded whole, so a multi-byte character is never cut
// at a chunk edge. Filtering happens before decoding: a skipped line costs no string.
async function* readLineBatches(abs, needles) {
  let batch = []
  let batchBytes = 0
  let pending = []
  let isFirst = true
  const take = (line) => {
    if (isFirst) {
      isFirst = false
      if (line[0] === 0xef && line[1] === 0xbb && line[2] === 0xbf) line = line.subarray(3)
    }
    if (line.at(-1) === 0x0d) line = line.subarray(0, -1)
    if (needles && !needles.some(n => line.includes(n))) return
    batch.push(line.toString('utf8'))
    batchBytes += line.length + 1
  }
  for await (const chunk of createReadStream(abs, { highWaterMark: 1024 * 1024 })) {
    let start = 0
    let nl
    while ((nl = chunk.indexOf(0x0a, start)) !== -1) {
      const piece = chunk.subarray(start, nl)
      take(pending.length ? Buffer.concat([...pending, piece]) : piece)
      pending = []
      start = nl + 1
      if (batchBytes >= LINE_BATCH_BYTES) {
        yield batch
        batch = []
        batchBytes = 0
      }
    }
    if (start < chunk.length) pending.push(chunk.subarray(start))
  }
  if (pending.length) take(Buffer.concat(pending))
  if (batch.length) yield batch
}

export function createFsUtils(dir, checkPermission, pluginDir = null, pluginId = null, storeDir = null) {
  const ctx = () => ({ dir, pluginDir, pluginId, storeDir })

  return {
    async read(relPath, { throw: shouldThrow = true, from, to } = {}) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      try {
        const edge = await readEdgeLines(abs, from, to)
        if (edge !== undefined) return edge
        const content = stripBom(await fsPromises.readFile(abs, 'utf8'))
        return sliceLines(content, from, to)
      } catch (err) {
        if (!shouldThrow && err.code === 'ENOENT') return null
        throw err
      }
    },

    async resolve(relPath = '.') {
      return resolvePath(relPath, ctx())
    },

    async exists(relPath) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      try {
        await fsPromises.access(abs)
        return true
      } catch {
        return false
      }
    },

    async glob(pattern, { cwd: cwdOpt, ignore = [], onlyDirectories = false, dot = false, expandDirectories = false } = {}) {
      if (path.isAbsolute(pattern)) {
        throw new Error('utils.fs.glob does not support absolute patterns — use a relative pattern.')
      }
      const resolvedCwd = cwdOpt ? resolvePath(cwdOpt, ctx()) : dir
      if (checkPermission) checkPermission('fs.glob', pattern, resolvedCwd)

      const results = await glob(pattern, {
        cwd: resolvedCwd,
        ignore,
        dot,
        expandDirectories,
        onlyFiles: !onlyDirectories,
        onlyDirectories,
      })

      return results.map(r => r.replace(/\\/g, '/'))
    },

    async write(relPath, content) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.writeFile(abs, content, 'utf8')
    },

    async copy(src, dest) {
      if (checkPermission) checkPermission('fs.read',  src)
      if (checkPermission) checkPermission('fs.write', dest)
      const srcAbs  = resolvePath(src,  ctx())
      const destAbs = resolvePath(dest, ctx())
      await fsPromises.mkdir(path.dirname(destAbs), { recursive: true })
      await fsPromises.copyFile(srcAbs, destAbs)
    },

    async remove(relPath, { recursive = false } = {}) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.rm(abs, { recursive, force: true })
    },

    async move(src, dest) {
      if (checkPermission) checkPermission('fs.read',  src)
      if (checkPermission) checkPermission('fs.write', dest)
      const srcAbs  = resolvePath(src,  ctx())
      const destAbs = resolvePath(dest, ctx())
      await fsPromises.mkdir(path.dirname(destAbs), { recursive: true })
      try {
        await fsPromises.rename(srcAbs, destAbs)
      } catch (err) {
        if (err.code === 'EXDEV') {
          await fsPromises.cp(srcAbs, destAbs, { recursive: true })
          await fsPromises.rm(srcAbs, { recursive: true, force: true })
        } else {
          throw err
        }
      }
    },

    async stat(relPath) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      const s = await fsPromises.stat(abs)
      return {
        size: s.size,
        mtime: s.mtime.toISOString(),
        birthtime: s.birthtime.toISOString(),
        isDirectory: s.isDirectory(),
        isFile: s.isFile(),
      }
    },

    async mkdir(relPath) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.mkdir(abs, { recursive: true })
    },

    async readBytes(relPath, { throw: shouldThrow = true } = {}) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      try {
        const buffer = await fsPromises.readFile(abs)
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      } catch (err) {
        if (!shouldThrow && err.code === 'ENOENT') return null
        throw err
      }
    },

    async writeBytes(relPath, content) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.writeFile(abs, content)
    },

    async append(relPath, content) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.appendFile(abs, content, 'utf8')
    },

    async prepend(relPath, content) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      if (checkPermission) checkPermission('fs.write', relPath)
      let existing = ''
      try {
        existing = await fsPromises.readFile(abs, 'utf8')
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.writeFile(abs, content + existing, 'utf8')
    },

    async appendBytes(relPath, content) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.appendFile(abs, content)
    },

    async chmod(relPath, mode) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.chmod(abs, mode)
    },

    readStreamIter(relPath) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      return createReadStream(abs)
    },

    readLinesIter(relPath, { contains } = {}) {
      if (contains != null && !Array.isArray(contains)) throw new TypeError('fs.readLinesStream: contains must be an array of strings')
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      return readLineBatches(abs, contains?.map(s => Buffer.from(s, 'utf8')) ?? null)
    },

    async appendStreamRef(relPath) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)

      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      const stream = createWriteStream(abs, { flags: 'a' })
      return {
        write(chunk) {
          return new Promise((resolve, reject) => {
            const onDrain = () => {
              stream.removeListener('error', onError)
              resolve()
            }
            const onError = (err) => {
              stream.removeListener('drain', onDrain)
              reject(err)
            }
            if (!stream.write(chunk)) {
              stream.once('drain', onDrain)
              stream.once('error', onError)
            } else {
              resolve()
            }
          })
        },
        close() {
          return new Promise((resolve, reject) => {
            const onError = (err) => reject(err)
            stream.once('error', onError)
            stream.end(() => {
              stream.removeListener('error', onError)
              resolve()
            })
          })
        }
      }
    },

    async writeStreamRef(relPath) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      const stream = createWriteStream(abs)
      return {
        write(chunk) {
          return new Promise((resolve, reject) => {
            const onDrain = () => {
              stream.removeListener('error', onError)
              resolve()
            }
            const onError = (err) => {
              stream.removeListener('drain', onDrain)
              reject(err)
            }
            
            if (!stream.write(chunk)) {
              stream.once('drain', onDrain)
              stream.once('error', onError)
            } else {
              resolve()
            }
          })
        },
        close() {
          return new Promise((resolve, reject) => {
            const onError = (err) => reject(err)
            stream.once('error', onError)
            stream.end(() => {
              stream.removeListener('error', onError)
              resolve()
            })
          })
        }
      }
    },

    watch(pattern, callback, { debounce = 50 } = {}) {
      if (checkPermission) checkPermission('fs.read', pattern)
      // Windows hands back 8.3 short paths (os.tmpdir() -> C:\Users\RUNNER~1\...).
      // libuv compares each event filename against the directory string it was
      // given and aborts the process when they disagree, so watch the long form.
      const baseDir = realPathOr(dir)
      const isGlob = /[*?{}\[\]!]/.test(pattern)
      const watchRoot = realPathOr(isGlob
        ? path.join(baseDir, pattern.replace(/[*?{}\[\]!].*$/, '').replace(/\/$/, '') || '.')
        : path.isAbsolute(pattern) ? pattern : path.join(baseDir, pattern))
      const isMatch = isGlob ? picomatch(pattern) : null
      const timers = new Map()

      const fire = (type, filePath) => {
        const rel = path.relative(baseDir, filePath).replace(/\\/g, '/')
        if (isMatch && !isMatch(rel)) return
        const key = `${type}:${rel}`
        if (timers.has(key)) clearTimeout(timers.get(key))
        timers.set(key, setTimeout(() => {
          timers.delete(key)
          callback({ type, path: rel })
        }, debounce))
      }

      const watcher = getChokidar().watch(watchRoot, {
        ignoreInitial: true,
        persistent: false,
      })

      watcher.on('add',    p => fire('create', p))
      watcher.on('change', p => fire('modify', p))
      watcher.on('unlink', p => fire('delete', p))

      return {
        stop() { watcher.close() }
      }
    },
  }
}
