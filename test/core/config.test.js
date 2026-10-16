import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { validateConfig, mergeConfigs, coercePlugins, enabledPluginKeys, absolutizeEntryPaths, LAYER } from '../../src/core/config.js'

const abs = p => path.resolve(p).replace(/\\/g, '/')

describe('validateConfig', () => {
  it('ignores a top-level permissions map (not a supported shape)', () => {
    const config = {
      permissions: {
        "my-rune": {
          "allow": ["fs.read:src/**"]
        }
      }
    }
    expect(() => validateConfig(config)).not.toThrow()
  })

  it('throws error if local runes permissions block is flat (non-scoped)', () => {
    const bad = {
      runes: {
        myrune: { permissions: { allow: ['fs.read:*'] } }
      }
    }
    expect(() => validateConfig(bad)).toThrow()
  })

  it('refuses a v1 entry, printing it rewritten with run and repl blocks', () => {
    const config = {
      runes: {
        myrune: { path: '.crunes/runes/myrune.js', permissions: { run: { allow: ['fs.read:*'] }, repl: { allow: [] } } }
      }
    }
    let message = ''
    try { validateConfig(config) } catch (err) { message = err.message }
    expect(message).toContain('runes["myrune"] uses the old entry shape')
    expect(message).toContain('"command": ".crunes/runes/myrune.rune.js"')
    expect(message).toContain('.crunes/runes/myrune.js → .crunes/runes/myrune.rune.js')
    expect(message).toContain('crunes migrate')
  })

  it('throws on a plugin-rune override key missing the marketplace prefix', () => {
    const config = {
      runes: {
        'git:status': { vars: { region: 'us-east-1' } }
      }
    }
    expect(() => validateConfig(config)).toThrow(
      'config.json: runes["git:status"] is a plugin-rune override — but "git" is missing the marketplace ' +
      'prefix. Use the full "marketplace@plugin:status" form.'
    )
  })

  it('does not throw on a fully-qualified plugin-rune override key', () => {
    const config = {
      runes: {
        'my-org@git:status': { vars: { region: 'us-east-1' } }
      }
    }
    expect(() => validateConfig(config)).not.toThrow()
  })

  it('does not throw on a local rune entry whose key happens to contain a colon, if it names a command', () => {
    const config = {
      runes: {
        'weird:name': { run: '.crunes/runes/weird-name.rune.js' }
      }
    }
    expect(() => validateConfig(config)).not.toThrow()
  })

  it('does not throw on a plugin alias entry whose key contains a colon', () => {
    const config = {
      runes: {
        'my-alias:thing': { plugin: 'my-org@git:status' }
      }
    }
    expect(() => validateConfig(config)).not.toThrow()
  })

  it('does not throw on an ordinary local rune key with no colon at all', () => {
    const config = {
      runes: {
        myrune: { run: '.crunes/runes/myrune.rune.js' }
      }
    }
    expect(() => validateConfig(config)).not.toThrow()
  })
})

describe('mergeConfigs', () => {
  it('does not specially merge a top-level vars map — local key wins as a plain primitive', () => {
    const shared = {
      vars: {
        "my-rune": { "profile": "developer", "debug": false }
      }
    }
    const local = {
      vars: {
        "my-rune": { "profile": "operator", "token": "secret" }
      }
    }
    const result = mergeConfigs(shared, local)
    expect(result.vars).toEqual({
      "my-rune": { "profile": "operator", "token": "secret" }
    })
  })

  it('deep merges runes entries', () => {
    const shared = {
      runes: {
        "my-rune": {
          path: "runes/my-rune.js",
          vars: { profile: "developer", debug: false }
        }
      }
    }
    const local = {
      runes: {
        "my-rune": {
          vars: { profile: "operator" }
        }
      }
    }
    const result = mergeConfigs(shared, local)
    expect(result.runes["my-rune"]).toEqual({
      path: "runes/my-rune.js",
      vars: { profile: "operator", debug: false }
    })
  })

  it('does not specially merge a top-level permissions map — local key wins as a plain primitive', () => {
    const shared = {
      permissions: {
        "my-rune": {
          use: { allow: ["fs.read:src/**"] }
        }
      }
    }
    const local = {
      permissions: {
        "my-rune": {
          use: { allow: ["fs.read:/**"] }
        }
      }
    }
    const result = mergeConfigs(shared, local)
    expect(result.permissions).toEqual({
      "my-rune": {
        use: { allow: ["fs.read:/**"] }
      }
    })
  })

  it('overrides global primitives', () => {
    const shared = { isolateMemoryMb: 128 }
    const local = { isolateMemoryMb: 256 }
    const result = mergeConfigs(shared, local)
    expect(result.isolateMemoryMb).toBe(256)
  })
})

describe('absolutizeEntryPaths', () => {
  it('resolves a run command naming a file against the layer base dir', () => {
    const out = absolutizeEntryPaths({ runes: { serve: { run: 'runes/serve.rune.js' } } }, '/store', 'global')
    expect(out.runes.serve.run.command.replace(/\\/g, '/')).toBe(abs('/store/runes/serve.rune.js'))
  })

  it('gives a global entry no default command — nothing is found that was not declared', () => {
    const out = absolutizeEntryPaths({ runes: { serve: {} } }, '/store', 'global')
    expect(out.runes.serve.run).toBeUndefined()
    expect(out.runes.serve.path).toBeUndefined()
  })

  it('leaves a pathless project entry pathless, so it can override a global entry', () => {
    const out = absolutizeEntryPaths({ runes: { serve: {} } }, '/proj', 'project')
    expect(out.runes.serve.path).toBeUndefined()
  })

  it('leaves a plugin-rune override key without a path', () => {
    const out = absolutizeEntryPaths({ runes: { 'mp@plug:status': { vars: { a: 1 } } } }, '/proj', 'project')
    expect(out.runes['mp@plug:status'].path).toBeUndefined()
  })

  it('leaves a plugin alias entry without a path', () => {
    const out = absolutizeEntryPaths({ runes: { deploy: { plugin: 'mp@plug:deploy' } } }, '/proj', 'project')
    expect(out.runes.deploy.path).toBeUndefined()
  })

  it('tags each entry with its layer', () => {
    const out = absolutizeEntryPaths({ runes: { serve: {} } }, '/store', 'global')
    expect(out.runes.serve[LAYER]).toBe('global')
  })

  it('resolves template paths the same way', () => {
    const out = absolutizeEntryPaths({ templates: { base: {} } }, '/store', 'global')
    expect(out.templates.base.path.replace(/\\/g, '/')).toBe(abs('/store/templates/base.js'))
  })
})

describe('mergeConfigs templates', () => {
  it('merges templates per key instead of replacing the whole map', () => {
    const result = mergeConfigs(
      { templates: { a: { path: '/store/templates/a.js' } } },
      { templates: { b: { path: '/proj/.crunes/templates/b.js' } } }
    )
    expect(Object.keys(result.templates).sort()).toEqual(['a', 'b'])
  })
})

describe('partial override across layers', () => {
  it('keeps the defining layer command when a later layer overrides only vars', () => {
    const global = absolutizeEntryPaths(
      { runes: { serve: { run: 'runes/serve.rune.js', vars: { port: 3000 } } } }, '/store', 'global')
    const project = absolutizeEntryPaths(
      { runes: { serve: { vars: { port: 4000 } } } }, '/proj', 'project')
    const merged = mergeConfigs(global, project)
    expect(merged.runes.serve.run.command.replace(/\\/g, '/')).toBe(abs('/store/runes/serve.rune.js'))
    expect(merged.runes.serve.vars).toEqual({ port: 4000 })
  })

  it('takes the overriding layer command when that layer supplies its own', () => {
    const global = absolutizeEntryPaths(
      { runes: { serve: { run: 'runes/serve.rune.js' } } }, '/store', 'global')
    const project = absolutizeEntryPaths(
      { runes: { serve: { run: 'custom/serve.rune.js' } } }, '/proj', 'project')
    const merged = mergeConfigs(global, project)
    expect(merged.runes.serve.run.command.replace(/\\/g, '/')).toBe(abs('/proj/custom/serve.rune.js'))
  })
})

describe('plugins as a boolean map', () => {
  it('coerces a legacy array into an all-true map', () => {
    expect(coercePlugins(['a@x', 'b@y'])).toEqual({ 'a@x': true, 'b@y': true })
  })

  it('passes a map through unchanged and treats missing as empty', () => {
    expect(coercePlugins({ 'a@x': false })).toEqual({ 'a@x': false })
    expect(coercePlugins(undefined)).toEqual({})
  })

  it('merges maps last-wins so a later layer can disable', () => {
    const result = mergeConfigs({ plugins: { 'a@x': true } }, { plugins: { 'a@x': false } })
    expect(result.plugins).toEqual({ 'a@x': false })
  })

  it('coerces a legacy array on either side of a merge', () => {
    const result = mergeConfigs({ plugins: ['a@x'] }, { plugins: { 'b@y': true } })
    expect(result.plugins).toEqual({ 'a@x': true, 'b@y': true })
  })

  it('lists only keys explicitly enabled', () => {
    expect(enabledPluginKeys({ plugins: { 'a@x': true, 'b@y': false } })).toEqual(['a@x'])
  })

  it('lists keys from a legacy array config', () => {
    expect(enabledPluginKeys({ plugins: ['a@x'] })).toEqual(['a@x'])
  })
})

describe('validateConfig with fileNames', () => {
  it('does not throw on a top-level permissions map regardless of file name', () => {
    const config = {
      permissions: {
        "my-rune": { allow: ["fs.read:src/**"] }
      }
    }
    expect(() => validateConfig(config, 'config.local.json')).not.toThrow()
  })

  it('still throws with correct filename for a malformed nested runes[key].permissions block', () => {
    const config = {
      runes: {
        "my-rune": { permissions: { allow: ["fs.read:src/**"] } }
      }
    }
    expect(() => validateConfig(config, 'config.local.json')).toThrow(
      'config.local.json: runes["my-rune"] uses the old entry shape'
    )
  })
})
