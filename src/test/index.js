import path from 'node:path'
import { createUtils } from '../rune/api/index.js'
import * as cryptApi from '../rune/api/crypt.js'
import * as codecApi from '../rune/api/codec.js'
import { makePermissionChecker } from '../rune/permissions/permissions.js'
import { installCrunesTestHooks, setCrunesTestRoots } from './register.js'

export { installCrunesTestHooks, setCrunesTestRoots }

function createTestCrypt() {
  return {
    hash: cryptApi.hash,
    hashAsHex: cryptApi.hashAsHex,
    hashAsBase64: cryptApi.hashAsBase64,
    hmac: cryptApi.hmac,
    hmacAsHex: cryptApi.hmacAsHex,
    hmacAsBase64: cryptApi.hmacAsBase64,
    encrypt: cryptApi.encrypt,
    decrypt: cryptApi.decrypt,
    uuid: cryptApi.uuid,
    randomHex: cryptApi.randomHex,
    randomBase64: cryptApi.randomBase64,
    randomBytes: cryptApi.randomBytesFn,
  }
}

function createTestRune() {
  return {
    helpText: () => '',
    helpSection: () => [{ name: 'help', title: 'Help', attrs: {}, data: { type: 'markdown', content: '' } }],
    exec: async () => {
      throw new Error('rune.exec() is not stubbed in setupCrunesTest(); pass mocks.rune.exec to test it')
    },
    spawn: () => {
      throw new Error('rune.spawn() is not stubbed in setupCrunesTest(); pass mocks.rune.spawn to test it')
    },
    spawnRepl: () => {
      throw new Error('rune.spawnRepl() is not stubbed in setupCrunesTest(); pass mocks.rune.spawnRepl to test it')
    },
  }
}

function createTestFs(fs) {
  return {
    ...fs,
    readLinesStream(path, opts) {
      let iter
      return new ReadableStream({
        async start() { iter = fs.readLinesIter(path, opts) },
        async pull(controller) {
          const { value, done } = await iter.next()
          if (done) controller.close()
          else for (const line of value) controller.enqueue(line)
        },
        async cancel() { await iter.return() },
      })
    },
  }
}

function createTestSqlite(sqlite) {
  return {
    async open(location, name) {
      const handle = await sqlite.openHandle(location, name ?? undefined)
      const db = {
        query: async (sql, params) => handle.query(sql, params),
        get: async (sql, params) => handle.get(sql, params),
        exec: async (sql, params) => handle.exec(sql, params),
        run: async (sql) => handle.run(sql),
        transaction: async (fn) => {
          await db.exec('BEGIN')
          try { await fn(); await db.exec('COMMIT') }
          catch (e) { await db.exec('ROLLBACK'); throw e }
        },
        close: async () => handle.close(),
      }
      return db
    },
  }
}

export function setupCrunesTest({
  cwd = process.cwd(),
  projectRoot = cwd,
  pluginDir = null,
  permissions = null,
  vars = {},
  requestedSections = null,
  pluginId = null,
  projectName = undefined,
  allowStdin = true,
  mocks = {},
} = {}) {
  const absCwd = path.resolve(cwd)
  const absProject = projectRoot ? path.resolve(projectRoot) : absCwd
  const absPlugin = pluginDir ? path.resolve(pluginDir) : null

  installCrunesTestHooks({ projectRoot: absProject, pluginRoot: absPlugin })
  setCrunesTestRoots({ projectRoot: absProject, pluginRoot: absPlugin })

  const checkPermission = permissions
    ? makePermissionChecker(permissions, { projectDir: absCwd, pluginDir: absPlugin })
    : null

  const { utils, dispose } = createUtils(
    absCwd,
    checkPermission,
    absPlugin,
    permissions ?? { allow: [], deny: [] },
    vars,
    requestedSections,
    pluginId,
    projectName,
    { allowStdin }
  )

  const merged = {
    ...utils,
    fs: createTestFs(utils.fs),
    sqlite: createTestSqlite(utils.sqlite),
    crypt: createTestCrypt(),
    codec: { ...codecApi },
    time: { after: ms => new Promise(resolve => setTimeout(resolve, ms)) },
    rune: createTestRune(),
  }

  for (const [ns, override] of Object.entries(mocks)) {
    merged[ns] = { ...(merged[ns] ?? {}), ...override }
  }

  globalThis.__CRUNES_TEST_UTILS__ = merged

  return {
    utils: merged,
    async cleanup() {
      if (globalThis.__CRUNES_TEST_UTILS__ === merged) {
        globalThis.__CRUNES_TEST_UTILS__ = null
      }
      await dispose()
    },
  }
}
