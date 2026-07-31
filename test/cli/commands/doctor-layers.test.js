import { describe, it, expect } from 'vitest'
import { collectLayerWarnings } from '../../../src/cli/commands/doctor.js'

describe('collectLayerWarnings', () => {
  it('warns when a project rune key shadows a global one', () => {
    const warnings = collectLayerWarnings({
      global:  { runes: { serve: {} } },
      project: { runes: { serve: {} } },
    })
    expect(warnings.join('\n')).toMatch(/"serve".*shadows the global/)
  })

  it('warns when a project disables a globally-enabled plugin', () => {
    const warnings = collectLayerWarnings({
      global:  { plugins: { 'mp@plug': true } },
      project: { plugins: { 'mp@plug': false } },
    })
    expect(warnings.join('\n')).toMatch(/"mp@plug".*disabled in this project/)
  })

  it('is silent when the layers do not overlap', () => {
    expect(collectLayerWarnings({
      global:  { runes: { serve: {} } },
      project: { runes: { build: {} } },
    })).toEqual([])
  })
})
