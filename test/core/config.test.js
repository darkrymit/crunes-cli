import { describe, it, expect, vi } from 'vitest'
import { validateConfig, mergeConfigs } from '../../src/core/config.js'

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

  it('warns if local runes permissions block is empty', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = {
      runes: {
        myrune: { permissions: { run: {} } }
      }
    }
    validateConfig(config)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('throws on a plugin-rune override key missing the marketplace prefix', () => {
    const config = {
      runes: {
        'git:status': { vars: { region: 'us-east-1' } }
      }
    }
    expect(() => validateConfig(config)).toThrow(
      'config.json: runes["git:status"] has no path or plugin, so it can only be a plugin-rune ' +
      'override — but "git" is missing the marketplace prefix. Use the full ' +
      '"marketplace@plugin:status" form.'
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

  it('does not throw on a local rune entry whose key happens to contain a colon, if it has a path', () => {
    const config = {
      runes: {
        'weird:name': { path: '.crunes/runes/weird-name.js' }
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
        myrune: { path: '.crunes/runes/myrune.js' }
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

  it('unions plugins list', () => {
    const shared = { plugins: ["plugin-a", "plugin-b"] }
    const local = { plugins: ["plugin-b", "plugin-c"] }
    const result = mergeConfigs(shared, local)
    expect(result.plugins).toEqual(["plugin-a", "plugin-b", "plugin-c"])
  })

  it('overrides global primitives', () => {
    const shared = { isolateMemoryMb: 128 }
    const local = { isolateMemoryMb: 256 }
    const result = mergeConfigs(shared, local)
    expect(result.isolateMemoryMb).toBe(256)
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
      'config.local.json: runes["my-rune"].permissions must be lifecycle-scoped (e.g. permissions.run.allow)'
    )
  })
})
