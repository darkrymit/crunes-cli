import { describe, it, expect } from 'vitest'
import { jobStdoutPath, jobStderrPath } from '../../../src/job/registry.js'

describe('shell job log paths', () => {
  it('stdout path contains .stdout.log suffix', () => {
    const p = jobStdoutPath('myproject', 'job-123')
    expect(p).toMatch(/job-123\.stdout\.log$/)
  })

  it('stderr path contains .stderr.log suffix', () => {
    const p = jobStderrPath('myproject', 'job-123')
    expect(p).toMatch(/job-123\.stderr\.log$/)
  })

  it('stdout and stderr paths differ only in suffix', () => {
    const stdout = jobStdoutPath('myproject', 'job-123')
    const stderr = jobStderrPath('myproject', 'job-123')
    expect(stdout.replace('.stdout.log', '')).toBe(stderr.replace('.stderr.log', ''))
  })
})
