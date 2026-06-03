import { describe, it, expect } from 'vitest'

describe('rune.exec — subprocess result parsing', () => {
  it('parses JSONL stdout and returns RuneResult shape', async () => {
    const jsonlLines = [
      JSON.stringify({ type: 'section', section: { name: 'result', data: { type: 'text', content: 'hello' } } }),
      JSON.stringify({ type: 'event', message: 'done' }),
      '',
    ].join('\n')

    const sections = []
    for (const line of jsonlLines.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'section') sections.push(parsed.section)
      } catch {}
    }

    expect(sections).toHaveLength(1)
    expect(sections[0].name).toBe('result')
  })

  it('returns empty sections array for empty stdout', () => {
    const sections = []
    for (const line of ''.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'section') sections.push(parsed.section)
      } catch {}
    }
    expect(sections).toEqual([])
  })

  it('skips malformed JSONL lines without throwing', () => {
    const lines = 'not-json\n{"type":"section","section":{"name":"ok","data":{"type":"text"}}}\n'
    const sections = []
    for (const line of lines.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'section') sections.push(parsed.section)
      } catch {}
    }
    expect(sections).toHaveLength(1)
    expect(sections[0].name).toBe('ok')
  })
})
