import { describe, it, expect, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { handler as createTemplateHandler } from '../../../src/template/commands/create.js'

let projectRoot
beforeEach(() => {
  process.env.CRUNES_STORE = mkdtempSync(path.join(os.tmpdir(), 'crunes-tmpl-store-'))
  // Never let the handler fall back to process.cwd() — that is this repository.
  projectRoot = mkdtempSync(path.join(os.tmpdir(), 'crunes-tmpl-proj-'))
})

describe('template create -g', () => {
  it('writes the template under the store and registers it globally', async () => {
    await createTemplateHandler({ name: 'base', global: true, yes: true, projectRoot, configRoot: projectRoot })
    const store = process.env.CRUNES_STORE
    expect(existsSync(path.join(store, 'templates', 'base.js'))).toBe(true)
    const config = JSON.parse(readFileSync(path.join(store, 'config.json'), 'utf8'))
    expect(config.templates.base.path).toBe('templates/base.js')
  })
})
