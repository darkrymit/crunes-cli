/** Run shell commands from the project directory */
declare namespace shell {
  /**
   * Executes a fire-and-forget shell command and returns the output.
   * Requires `shell.exec:<command>` permission.
   *
   * @param cmd The shell command to run.
   * @param opts Execution options (timeout, trim, throw on error, env vars).
   * @returns A promise that resolves to the command output string or result object.
   */
  export function exec(cmd: string, opts?: { throw?: boolean, trim?: boolean, timeout?: number, env?: Record<string, string> }): Promise<string | { stdout: string, stderr: string, exitCode: number }>

  /**
   * Starts a shell session for interactive or background execution.
   * Requires `shell.exec:<command>` permission.
   *
   * @param cmd The shell command to start the session with.
   * @param opts Session options (env vars).
   * @returns A ShellSession object to interact with the running process.
   */
  export function execInSession(cmd: string, opts?: { env?: Record<string, string>, signal?: AbortSignal }): ShellSession

  interface ShellSession {
    readonly stdin: {
      write(text: string): void
      end(): void
    }
    readonly stdout: {
      on(event: 'data', callback: (chunk: Uint8Array) => void): void
      on(event: 'end', callback: () => void): void
    }
    readonly stderr: {
      on(event: 'data', callback: (chunk: Uint8Array) => void): void
      on(event: 'end', callback: () => void): void
    }
    on(event: 'exit', callback: (code: number) => void): void
    on(event: 'error', callback: (err: string) => void): void
    kill(signal?: string): void
  }
}
