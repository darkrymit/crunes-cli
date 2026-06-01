import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import unzipper from 'unzipper'
import { ZipArchive } from 'archiver'
import { create as tarCreate, extract as tarExtract, list as tarList } from 'tar'

function canonicalizePath(dir, inputPath) {
  const p = inputPath.replace(/\\/g, '/')
  if (path.isAbsolute(inputPath)) return p
  const resolved = path.resolve(dir, inputPath)
  const rel = path.relative(dir, resolved).replace(/\\/g, '/')
  return rel.startsWith('..') ? rel : './' + rel
}

function resolveToAbs(dir, inputPath) {
  if (path.isAbsolute(inputPath)) return inputPath
  return path.resolve(dir, inputPath)
}

function assertNoSlip(base, entryPath) {
  const rel = path.relative(base, path.resolve(base, entryPath))
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Zip slip detected: ${entryPath}`)
  }
}

export function createArchiveUtils(dir, checkPermission) {
  function checkPerms(source, dest) {
    const srcToken = canonicalizePath(dir, source)
    const dstToken = canonicalizePath(dir, dest)
    if (checkPermission) checkPermission('fs.read', srcToken)
    if (checkPermission) checkPermission('fs.write', dstToken)
  }

  return {
    async unzip(source, dest) {
      checkPerms(source, dest)
      const srcAbs = resolveToAbs(dir, source)
      const dstAbs = resolveToAbs(dir, dest)

      const directory = await unzipper.Open.file(srcAbs)
      for (const file of directory.files) {
        assertNoSlip(dstAbs, file.path)
      }

      await fs.mkdir(dstAbs, { recursive: true })
      for (const file of directory.files) {
        const absEntry = path.resolve(dstAbs, file.path)
        if (file.type === 'Directory') {
          await fs.mkdir(absEntry, { recursive: true })
        } else {
          await fs.mkdir(path.dirname(absEntry), { recursive: true })
          await pipeline(file.stream(), createWriteStream(absEntry))
        }
      }
    },

    async zip(source, dest) {
      checkPerms(source, dest)
      const srcAbs = resolveToAbs(dir, source)
      const dstAbs = resolveToAbs(dir, dest)
      await fs.mkdir(path.dirname(dstAbs), { recursive: true })

      await new Promise((resolve, reject) => {
        const output = createWriteStream(dstAbs)
        const arc = new ZipArchive({ zlib: { level: 9 } })
        output.on('close', resolve)
        arc.on('error', reject)
        arc.pipe(output)
        fs.stat(srcAbs)
          .then(stat => {
            if (stat.isDirectory()) {
              arc.directory(srcAbs, false)
            } else {
              arc.file(srcAbs, { name: path.basename(srcAbs) })
            }
            return arc.finalize()
          })
          .catch(reject)
      })
    },

    async untar(source, dest, { gzip } = {}) {
      checkPerms(source, dest)
      const srcAbs = resolveToAbs(dir, source)
      const dstAbs = resolveToAbs(dir, dest)

      let useGzip = gzip
      if (useGzip === undefined) {
        const fd = await fs.open(srcAbs, 'r')
        const buf = Buffer.alloc(2)
        await fd.read(buf, 0, 2, 0)
        await fd.close()
        useGzip = buf[0] === 0x1f && buf[1] === 0x8b
      }

      const entries = []
      await tarList({ file: srcAbs, onentry: (e) => entries.push(e.path) })
      for (const p of entries) {
        assertNoSlip(dstAbs, p)
      }

      await fs.mkdir(dstAbs, { recursive: true })
      await tarExtract({ gzip: useGzip, file: srcAbs, cwd: dstAbs })
    },

    async tar(source, dest, { gzip = true } = {}) {
      checkPerms(source, dest)
      const srcAbs = resolveToAbs(dir, source)
      const dstAbs = resolveToAbs(dir, dest)
      await fs.mkdir(path.dirname(dstAbs), { recursive: true })

      const stat = await fs.stat(srcAbs)
      if (stat.isDirectory()) {
        await tarCreate({ gzip, file: dstAbs, cwd: srcAbs }, ['.'])
      } else {
        await tarCreate({ gzip, file: dstAbs, cwd: path.dirname(srcAbs) }, [path.basename(srcAbs)])
      }
    },

    zipStream(source) {
      const srcToken = canonicalizePath(dir, source)
      if (checkPermission) checkPermission('fs.read', srcToken)
      const srcAbs = resolveToAbs(dir, source)
      
      const arc = new ZipArchive({ zlib: { level: 9 } })
      fs.stat(srcAbs).then(stat => {
        if (stat.isDirectory()) {
          arc.directory(srcAbs, false)
        } else {
          arc.file(srcAbs, { name: path.basename(srcAbs) })
        }
        arc.finalize()
      }).catch(err => {
        arc.emit('error', err)
      })
      return arc
    },

    unzipStream(dest) {
      const dstToken = canonicalizePath(dir, dest)
      if (checkPermission) checkPermission('fs.write', dstToken)
      const dstAbs = resolveToAbs(dir, dest)
      
      const activePromises = new Set()
      const parser = unzipper.Parse()
      parser.on('entry', (entry) => {
        try {
          assertNoSlip(dstAbs, entry.path)
          const absEntry = path.resolve(dstAbs, entry.path)
          
          let p
          if (entry.type === 'Directory') {
            p = fs.mkdir(absEntry, { recursive: true })
              .then(() => entry.autodrain())
              .catch(() => entry.autodrain())
          } else {
            p = fs.mkdir(path.dirname(absEntry), { recursive: true })
              .then(() => pipeline(entry, createWriteStream(absEntry)))
              .catch(() => entry.autodrain())
          }
          
          activePromises.add(p)
          p.finally(() => activePromises.delete(p))
        } catch (err) {
          entry.autodrain()
        }
      })
      
      return {
        write(chunk) {
          return new Promise((resolve, reject) => {
            const onDrain = () => {
              parser.removeListener('error', onError)
              resolve()
            }
            const onError = (err) => {
              parser.removeListener('drain', onDrain)
              reject(err)
            }
            if (!parser.write(chunk)) {
              parser.once('drain', onDrain)
              parser.once('error', onError)
            } else {
              resolve()
            }
          })
        },
        close() {
          return new Promise((resolve, reject) => {
            const onError = (err) => reject(err)
            parser.once('error', onError)
            parser.end(async () => {
              parser.removeListener('error', onError)
              try {
                while (activePromises.size > 0) {
                  await Promise.all(Array.from(activePromises))
                }
                resolve()
              } catch (err) {
                reject(err)
              }
            })
          })
        }
      }
    },

    async tarStream(source, { gzip = true } = {}) {
      const srcToken = canonicalizePath(dir, source)
      if (checkPermission) checkPermission('fs.read', srcToken)
      const srcAbs = resolveToAbs(dir, source)
      
      const stat = await fs.stat(srcAbs)
      if (stat.isDirectory()) {
        return tarCreate({ gzip, cwd: srcAbs }, ['.'])
      } else {
        return tarCreate({ gzip, cwd: path.dirname(srcAbs) }, [path.basename(srcAbs)])
      }
    },

    async untarStream(dest, { gzip } = {}) {
      const dstToken = canonicalizePath(dir, dest)
      if (checkPermission) checkPermission('fs.write', dstToken)
      const dstAbs = resolveToAbs(dir, dest)
      
      await fs.mkdir(dstAbs, { recursive: true })
      
      const extractor = tarExtract({
        gzip,
        cwd: dstAbs,
        filter: (pathEntry, entry) => {
          assertNoSlip(dstAbs, pathEntry)
          return true
        }
      })

      return {
        write(chunk) {
          return new Promise((resolve, reject) => {
            const onDrain = () => {
              extractor.removeListener('error', onError)
              resolve()
            }
            const onError = (err) => {
              extractor.removeListener('drain', onDrain)
              reject(err)
            }
            if (!extractor.write(chunk)) {
              extractor.once('drain', onDrain)
              extractor.once('error', onError)
            } else {
              resolve()
            }
          })
        },
        close() {
          return new Promise((resolve, reject) => {
            const onError = (err) => reject(err)
            extractor.once('error', onError)
            extractor.end(() => {
              extractor.removeListener('error', onError)
              resolve()
            })
          })
        }
      }
    },
  }
}
