import { describe, it, expect } from 'vitest'
import { jobStdoutPath, jobStderrPath } from '../../../src/job/registry.js'

describe('shell job log paths', () => {
  it('stdout path contains stdout.log', () => {
    const p = jobStdoutPath('/myproject', 'job-123')
    expect(p).toMatch(/stdout\.log$/)
    expect(p).toContain('job-123')
  })

  it('stderr path contains stderr.log', () => {
    const p = jobStderrPath('/myproject', 'job-123')
    expect(p).toMatch(/stderr\.log$/)
    expect(p).toContain('job-123')
  })

  it('stdout and stderr paths are in the same directory', () => {
    const stdout = jobStdoutPath('/myproject', 'job-123')
    const stderr = jobStderrPath('/myproject', 'job-123')
    expect(stdout.replace('stdout.log', '')).toBe(stderr.replace('stderr.log', ''))
  })
})
