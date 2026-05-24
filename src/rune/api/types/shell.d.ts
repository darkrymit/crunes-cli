/** Run shell commands from the project directory */
declare namespace shell {
  /**
   * Runs a shell command to completion. Returns trimmed stdout.
   */
  function run(cmd: string, opts?: { throw?: boolean; trim?: boolean; timeout?: number; env?: Record<string, string> }): Promise<string | { stdout: string; stderr: string; exitCode: number }>
  
  /**
   * Starts an interactive background session
   */
  function session(cmd: string, opts?: { env?: Record<string, string> }): ShellSession

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
