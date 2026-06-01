import * as md from './md.js'
import * as treeUtils from './tree.js'
import { createFsUtils } from './fs.js'
import { createShellUtils } from './shell.js'
import { createJsonUtils } from './json.js'
import { createYamlUtils } from './yaml.js'
import { createXmlUtils } from './xml.js'
import { createHttpUtils } from './http.js'
import { createEnvUtils } from './env.js'
import { createVarsUtils } from './vars.js'
import { createArchiveUtils } from './archive.js'
import { createCacheUtils } from './cache.js'
import { createSqliteUtils } from './sqlite.js'
import { createWsUtils } from './ws.js'
import { createDbUtils } from './db.js'
import micromatch from 'micromatch'

export function createSectionUtils(patterns) {
  return {
    create(name, data, { title, attrs } = {}) {
      return { name, title, attrs: attrs ?? {}, data }
    },
    match(sectionName, overridePatterns) {
      const p = overridePatterns !== undefined ? overridePatterns : patterns;
      if (p == null) return true
      return micromatch.isMatch(sectionName, p)
    },
    selected() {
      return patterns
    }
  }
}

export function createUtils(dir, checkPermission = null, pluginDir = null, permissions = { allow: [], deny: [] }, vars = {}, requestedSections = null, pluginId = null, projectName = undefined) {
  const fs     = createFsUtils(dir, checkPermission, pluginDir, pluginId)
  const sqlite = createSqliteUtils(dir, checkPermission, { pluginId, projectName })
  const ws     = createWsUtils(checkPermission)
  const db     = createDbUtils(dir, checkPermission)
  const utils  = {
    md,
    tree: treeUtils,
    section: createSectionUtils(requestedSections),
    fs,
    shell:   createShellUtils(dir, checkPermission),
    json:    createJsonUtils(dir, fs),
    yaml:    createYamlUtils(dir, fs),
    xml:     createXmlUtils(dir, fs),
    http:    createHttpUtils(checkPermission),
    env:     createEnvUtils(dir, checkPermission, permissions),
    vars:    createVarsUtils(vars),
    archive: createArchiveUtils(dir, checkPermission),
    cache:   createCacheUtils(dir, checkPermission, { pluginId, projectName }),
    sqlite,
    ws,
    db,
  }
  return {
    utils,
    dispose: async () => {
      sqlite.dispose()
      ws.dispose()
      await db.dispose()
      utils.shell.dispose()
    }
  }
}
