import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadConfig } from '../../core/config.js'
import { compileIntro } from '../intro-compiler.js'
import { output } from '../../shared/output.js'

export async function handler({ global, out, format = 'md', projectRoot = process.cwd(), configRoot = projectRoot }) {
  let config = null
  let loadError = null

  if (!global) {
    try {
      config = loadConfig(configRoot)
    } catch (err) {
      loadError = err.message
    }
  }

  try {
    const content = await compileIntro({
      config,
      format,
      projectRoot,
      configRoot,
      hasProjectError: loadError,
    })

    if (out) {
      const targetPath = resolve(process.cwd(), out)
      writeFileSync(targetPath, content, 'utf8')
      output.info(`Successfully wrote Crunes intro to ${targetPath}`)
    } else {
      process.stdout.write(content + '\n')
    }
  } catch (err) {
    output.error(`Failed to compile Crunes intro: ${err.message}`)
    process.exit(1)
  }
}
