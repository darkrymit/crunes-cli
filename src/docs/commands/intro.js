import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileIntro } from '../intro-compiler.js'
import { output } from '../../shared/output.js'

export async function handler({ out } = {}) {
  try {
    const content = await compileIntro()

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
