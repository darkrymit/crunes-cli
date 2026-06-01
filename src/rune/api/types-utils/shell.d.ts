/** Run shell commands from the project directory */
declare namespace shell {
  export function exec(
    cmd: string, 
    opts?: { 
      throw?: boolean
      trim?: boolean
      timeout?: number
      env?: Record<string, string>
      stdin?: ReadableStream<Uint8Array | string> | Uint8Array | string
      binary?: boolean
    }
  ): Promise<string | Uint8Array | { stdout: string | Uint8Array, stderr: string, exitCode: number }>

  export function execInSession(
    cmd: string, 
    opts?: { 
      env?: Record<string, string>
      signal?: AbortSignal
      binary?: boolean
    }
  ): ShellSession

  interface ShellSession {
    readonly stdin: HybridWritableStream
    readonly stdout: HybridReadableStream
    readonly stderr: HybridReadableStream
    
    on(event: 'exit', callback: (code: number) => void): void
    on(event: 'error', callback: (err: string) => void): void
    
    kill(signal?: string): void
  }

  interface HybridWritableStream extends WritableStream<Uint8Array | string> {
    write(text: string | Uint8Array): void
    end(): void
  }

  interface HybridReadableStream extends ReadableStream<Uint8Array | string> {
    on(event: 'data', callback: (chunk: string | Uint8Array) => void): void
    on(event: 'end', callback: () => void): void
  }
}

