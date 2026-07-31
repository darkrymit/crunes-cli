import os from 'node:os'
import path from 'node:path'
import { mkdtempSync } from 'node:fs'
import { beforeEach } from 'vitest'

const TEST_STORE = mkdtempSync(path.join(os.tmpdir(), 'crunes-test-store-'))

process.env.CRUNES_STORE = TEST_STORE

// Re-assert before every test. Several suites `delete process.env.CRUNES_STORE`
// in their own afterEach, which would otherwise leave the rest of the run
// pointed at the developer's real ~/.crunes — rootless paths in particular
// resolve into the store, so a leak writes straight into the home directory.
// This hook is registered first, so a suite's own beforeEach still wins.
beforeEach(() => {
  process.env.CRUNES_STORE = TEST_STORE
})
