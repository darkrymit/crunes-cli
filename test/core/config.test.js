import { describe, it, expect } from 'vitest'
import { validateConfig } from '../../src/core/config.js'

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
})
