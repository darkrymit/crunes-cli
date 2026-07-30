import os from 'node:os'
import path from 'node:path'
import { mkdtempSync } from 'node:fs'

process.env.CRUNES_STORE = mkdtempSync(path.join(os.tmpdir(), 'crunes-test-store-'))
