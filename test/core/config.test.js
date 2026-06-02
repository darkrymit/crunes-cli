import { describe, it, expect, vi } from 'vitest'
import { validateConfig, mergeConfigs } from '../../src/core/config.js'

describe('validateConfig', () => {
  it('passes on validNamespacedConfig', () => {
    const config = {
      permissions: {
        "my-rune": {
          "use": {
            "allow": ["fs.read:src/**"]
          },
          "args": {
            "allow": ["env.read:API_KEY"]
          }
        }
      }
    }
    expect(() => validateConfig(config)).not.toThrow()
  })

  it('throws on flat allow list', () => {
    const config = {
      permissions: {
        "my-rune": {
          "allow": ["fs.read:src/**"]
        }
      }
    }
    expect(() => validateConfig(config)).toThrow(
      'config.json: permissions for "my-rune" must be lifecycle-scoped (e.g. permissions["my-rune"].use.allow)'
    )
  })

  it('throws on flat deny list', () => {
    const config = {
      permissions: {
        "my-rune": {
          "deny": ["fs.read:src/**"]
        }
      }
    }
    expect(() => validateConfig(config)).toThrow(
      'config.json: permissions for "my-rune" must be lifecycle-scoped (e.g. permissions["my-rune"].use.allow)'
    )
  })

  it('throws when permission value is a flat array', () => {
    const config = {
      permissions: {
        myrune: ['shell.exec:git status']
      }
    }
    expect(() => validateConfig(config))
      .toThrow('config.json: permissions for "myrune" must be lifecycle-scoped (e.g. permissions["myrune"].use.allow)')
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
        myrune: { permissions: { use: {} } }
      }
    }
    validateConfig(config)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('mergeConfigs', () => {
  it('deep merges vars', () => {
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
    expect(result.vars["my-rune"]).toEqual({
      profile: "operator",
      debug: false,
      token: "secret"
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

  it('completely replaces permissions per rune', () => {
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
    expect(result.permissions["my-rune"]).toEqual({
      use: { allow: ["fs.read:/**"] }
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
  it('throws with correct filename in error message', () => {
    const config = {
      permissions: {
        "my-rune": { allow: ["fs.read:src/**"] }
      }
    }
    expect(() => validateConfig(config, 'config.local.json')).toThrow(
      'config.local.json: permissions for "my-rune" must be lifecycle-scoped (e.g. permissions["my-rune"].use.allow)'
    )
  })
})
