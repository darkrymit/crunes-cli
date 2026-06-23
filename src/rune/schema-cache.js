import { readFile, writeFile, mkdir, readdir, rm, rename } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { join } from 'node:path'

const TYPES = ['args', 'argsRepl', 'commandsRepl']

function safeKey(runeKey) {
  return runeKey.replace(/:/g, '__')
}

function schemasDir(projectDir) {
  return join(projectDir, '.crunes', 'schemas')
}

function cacheFilePath(runeKey, type, projectDir) {
  return join(schemasDir(projectDir), `${safeKey(runeKey)}-${type}.json`)
}

export async function computeHash(runeFile, vars) {
  const content = await readFile(runeFile, 'utf8')
  const sortedVars = Object.fromEntries(Object.entries(vars).sort(([a], [b]) => a.localeCompare(b)))
  const contentHash = createHash('sha256').update(content).digest('hex')
  const varsHash = createHash('sha256').update(JSON.stringify(sortedVars)).digest('hex')
  return `${contentHash}:${varsHash}`
}

export async function readSchemaCache(runeKey, type, runeFile, vars, projectDir) {
  const filePath = cacheFilePath(runeKey, type, projectDir)
  let raw
  try {
    raw = await readFile(filePath, 'utf8')
  } catch {
    return undefined
  }
  let entry
  try {
    entry = JSON.parse(raw)
  } catch {
    return undefined
  }
  const hash = await computeHash(runeFile, vars)
  if (entry.hash !== hash) return undefined
  return entry.schema
}

export async function writeSchemaCache(runeKey, type, runeFile, vars, schema, projectDir) {
  const dir = schemasDir(projectDir)
  await mkdir(dir, { recursive: true })
  const hash = await computeHash(runeFile, vars)
  const entry = {
    runeKey,
    hash,
    cachedAt: new Date().toISOString(),
    schema,
  }
  const filePath = cacheFilePath(runeKey, type, projectDir)
  const tmp = join(dir, `.tmp-${randomBytes(6).toString('hex')}.json`)
  await writeFile(tmp, JSON.stringify(entry, null, 2), 'utf8')
  await rename(tmp, filePath)
}

export async function listSchemaCaches(projectDir) {
  const dir = schemasDir(projectDir)
  let files
  try {
    files = await readdir(dir)
  } catch {
    return []
  }
  const results = []
  for (const file of files) {
    if (!file.endsWith('.json') || file.startsWith('.tmp-')) continue
    const filePath = join(dir, file)
    try {
      const entry = JSON.parse(await readFile(filePath, 'utf8'))
      const match = file.match(/^(.+)-(args|argsRepl|commandsRepl)\.json$/)
      if (!match) continue
      results.push({
        runeKey: entry.runeKey ?? match[1].replace(/__/g, ':'),
        type: match[2],
        hash: entry.hash,
        cachedAt: entry.cachedAt,
        filePath,
      })
    } catch { /* skip unreadable */ }
  }
  return results
}

export async function deleteSchemaCache(runeKey, projectDir) {
  await Promise.all(
    TYPES.map(type =>
      rm(cacheFilePath(runeKey, type, projectDir), { force: true })
    )
  )
}
