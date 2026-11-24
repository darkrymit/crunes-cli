import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let installed = false
let roots = { projectRoot: null, pluginRoot: null }

export function setCrunesTestRoots({ projectRoot, pluginRoot } = {}) {
  if (projectRoot !== undefined) roots.projectRoot = projectRoot ? path.resolve(projectRoot) : null
  if (pluginRoot !== undefined) roots.pluginRoot = pluginRoot ? path.resolve(pluginRoot) : null
}

export function installCrunesTestHooks({ projectRoot, pluginRoot } = {}) {
  setCrunesTestRoots({ projectRoot, pluginRoot })
  if (installed) return
  installed = true

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === '@utils') {
        return { shortCircuit: true, url: 'crunes-test:@utils' }
      }
      if (roots.pluginRoot && specifier.startsWith('@plugin/')) {
        const target = path.resolve(roots.pluginRoot, specifier.slice('@plugin/'.length))
        return { shortCircuit: true, url: pathToFileURL(target).href }
      }
      if (roots.projectRoot && specifier.startsWith('@project/')) {
        const target = path.resolve(roots.projectRoot, specifier.slice('@project/'.length))
        return { shortCircuit: true, url: pathToFileURL(target).href }
      }
      return nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
      if (url === 'crunes-test:@utils') {
        return {
          shortCircuit: true,
          format: 'module',
          source: [
            `const get = ns => {`,
            `  const u = globalThis.__CRUNES_TEST_UTILS__`,
            `  if (!u) throw new Error('Call setupCrunesTest() before invoking @utils')`,
            `  return u[ns]`,
            `}`,
            `const proxy = ns => new Proxy({}, { get: (_, k) => get(ns)[k] })`,
            `export const fs = proxy('fs')`,
            `export const shell = proxy('shell')`,
            `export const section = proxy('section')`,
            `export const rune = proxy('rune')`,
            `export const json = proxy('json')`,
            `export const yaml = proxy('yaml')`,
            `export const xml = proxy('xml')`,
            `export const csv = proxy('csv')`,
            `export const http = proxy('http')`,
            `export const env = proxy('env')`,
            `export const vars = proxy('vars')`,
            `export const os = proxy('os')`,
            `export const stdin = proxy('stdin')`,
            `export const archive = proxy('archive')`,
            `export const cache = proxy('cache')`,
            `export const sqlite = proxy('sqlite')`,
            `export const db = proxy('db')`,
            `export const crypt = proxy('crypt')`,
            `export const codec = proxy('codec')`,
            `export const ws = proxy('ws')`,
            `export const time = proxy('time')`,
            `export const notify = proxy('notify')`,
            `export const md = proxy('md')`,
            `export const tree = proxy('tree')`,
          ].join('\n'),
        }
      }
      return nextLoad(url, context)
    },
  })
}

// Auto-install when loaded via `node --import @darkrymit/crunes-cli/test/register`
installCrunesTestHooks()
