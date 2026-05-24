/** Run shell commands from the project directory */
declare namespace shell {
  /**
   * Executes a fire-and-forget shell command and returns the output.
   *
   * @param cmd The shell command to run.
   * @param opts Execution options (timeout, trim, throw on error, env vars).
   * @returns A promise that resolves to the command output string or result object.
   */
  export function exec(cmd: string, opts?: { throw?: boolean, trim?: boolean, timeout?: number, env?: Record<string, string> }): Promise<string | { stdout: string, stderr: string, exitCode: number }>

  /**
   * Starts a shell session for interactive or background execution.
   *
   * @param cmd The shell command to start the session with.
   * @param opts Session options (env vars).
   * @returns A ShellSession object to interact with the running process.
   */
  export function execInSession(cmd: string, opts?: { env?: Record<string, string> }): ShellSession

  interface ShellSession {
    /** Writes text to the child process's standard input */
    write(text: string): void
    /** Waits for the output to match the pattern and returns the match */
    expect(pattern: string | RegExp, timeoutMs?: number): Promise<string>
    /** Returns all accumulated output as a string */
    output(): string
    /** Resolves with the exit code when the process terminates */
    waitForExit(): Promise<number>
    /** Forcefully terminates the process */
    kill(): void
  }
}
