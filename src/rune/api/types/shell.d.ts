/** Run shell commands from the project directory */
declare namespace shell {
  /**
   * Runs a shell command. Returns trimmed stdout by default. Throws ShellError on non-zero exit.
   * Called directly as utils.shell(cmd, opts).
   * @param cmd Shell command string to execute
   * @param opts Options
   */
  function shell(cmd: string, opts?: {
    throw?: boolean
    trim?: boolean
    timeout?: number
    env?: Record<string, string>
  }): Promise<string | { stdout: string; stderr: string; exitCode: number }>
}
