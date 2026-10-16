import path from 'node:path'

const ISOLATE_MODULE = /\.rune\.m?js$/i

/**
 * A command naming a file rather than a program on PATH — resolved the way a shell
 * resolves one, plus isolate modules (*.rune.js), which can never be programs.
 */
export function isPathCommand(command) {
  return command.includes('/') || command.includes('\\') || command.startsWith('.') ||
    path.isAbsolute(command) || ISOLATE_MODULE.test(command)
}
