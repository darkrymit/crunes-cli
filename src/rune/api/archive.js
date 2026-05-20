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

    async untar(source, dest) {
      checkPerms(source, dest)
      const srcAbs = resolveToAbs(dir, source)
      const dstAbs = resolveToAbs(dir, dest)

      const entries = []
      await tarList({ file: srcAbs, onentry: (e) => entries.push(e.path) })
      for (const p of entries) {
        assertNoSlip(dstAbs, p)
      }

      await fs.mkdir(dstAbs, { recursive: true })
      await tarExtract({ file: srcAbs, cwd: dstAbs })
    },

    async tar(source, dest) {
      checkPerms(source, dest)
      const srcAbs = resolveToAbs(dir, source)
      const dstAbs = resolveToAbs(dir, dest)
      await fs.mkdir(path.dirname(dstAbs), { recursive: true })

      const stat = await fs.stat(srcAbs)
      if (stat.isDirectory()) {
        await tarCreate({ gzip: true, file: dstAbs, cwd: srcAbs }, ['.'])
      } else {
        await tarCreate({ gzip: true, file: dstAbs, cwd: path.dirname(srcAbs) }, [path.basename(srcAbs)])
      }
    },
  }
}
