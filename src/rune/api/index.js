import * as md from './md.js'
import * as treeUtils from './tree.js'
import { createFsUtils } from './fs.js'
import { createShellUtils } from './shell.js'
import { createJsonUtils } from './json.js'
import { createYamlUtils } from './yaml.js'
import { createXmlUtils } from './xml.js'
import { createFetchUtils } from './fetch.js'
import { createEnvUtils } from './env.js'
import { createVarsUtils } from './vars.js'
import { createArchiveUtils } from './archive.js'
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

export function createUtils(dir, checkPermission = null, pluginDir = null, permissions = { allow: [], deny: [] }, vars = {}, requestedSections = null) {
  const fs = createFsUtils(dir, checkPermission, pluginDir)
  return {
    md,
    tree: treeUtils,
    section: createSectionUtils(requestedSections),
    fs,
    shell: createShellUtils(dir, checkPermission),
    json:  createJsonUtils(dir, fs),
    yaml:  createYamlUtils(dir, fs),
    xml:   createXmlUtils(dir, fs),
    fetch: createFetchUtils(checkPermission),
    env:     createEnvUtils(dir, checkPermission, permissions),
    vars:    createVarsUtils(vars),
    archive: createArchiveUtils(dir, checkPermission),
  }
}
