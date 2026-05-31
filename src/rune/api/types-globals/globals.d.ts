/**
 * Global Sandbox Timing and Utility Functions
 * 
 * These functions and classes are exposed globally inside the isolated-vm sandbox execution context.
 */
declare namespace globals {
  /**
   * Invokes the callback after the specified delay.
   * 
   * @param callback The function to execute when the timer expires.
   * @param delay The number of milliseconds to wait before invoking the callback (default: 0).
   * @param args Additional arguments to pass to the callback.
   * @returns A unique timeout identifier.
   */
  function setTimeout(callback: (...args: any[]) => void, delay?: number, ...args: any[]): number

  /**
   * Cancels a timeout previously established by calling setTimeout().
   * 
   * @param id The identifier returned by setTimeout().
   */
  function clearTimeout(id?: number): void

  /**
   * Repeatedly invokes the callback with a fixed time delay between each call.
   * 
   * @param callback The function to execute at each interval.
   * @param delay The number of milliseconds to wait between executions (default: 0).
   * @param args Additional arguments to pass to the callback.
   * @returns A unique interval identifier.
   */
  function setInterval(callback: (...args: any[]) => void, delay?: number, ...args: any[]): number

  /**
   * Cancels an interval execution previously established by calling setInterval().
   * 
   * @param id The identifier returned by setInterval().
   */
  function clearInterval(id?: number): void

  /**
   * High-performance string-to-UTF8 encoder.
   */
  class TextEncoder {
    /**
     * Encodes a string into raw UTF-8 binary bytes.
     * 
     * @param str The string to encode.
     */
    encode(str: string): Uint8Array
  }

  /**
   * Decodes UTF-8 binary bytes into a string.
   */
  class TextDecoder {
    /**
     * Decodes raw UTF-8 binary bytes into a string.
     *
     * @param bytes The raw binary bytes.
     */
    decode(bytes: Uint8Array): string
  }

  /**
   * Represents the signal object of an AbortController.
   */
  class AbortSignal {
    /** Whether the signal has been aborted. */
    readonly aborted: boolean
    addEventListener(type: 'abort', listener: (event: { type: string }) => void): void
    removeEventListener(type: 'abort', listener: (event: { type: string }) => void): void
    dispatchEvent(event: { type: string }): void
  }

  /**
   * Provides an AbortSignal that can be used to abort one or more operations.
   */
  class AbortController {
    readonly signal: AbortSignal
    abort(): void
  }

  interface ReadableStream<R = any> {
    readonly locked: boolean
    cancel(reason?: any): Promise<void>
    getReader(): any
    pipeTo(dest: WritableStream<R>, options?: any): Promise<void>
    pipeThrough<T>(transform: TransformStream<R, T>, options?: any): ReadableStream<T>
    [Symbol.asyncIterator](): AsyncIterableIterator<R>
  }

  interface WritableStream<W = any> {
    readonly locked: boolean
    abort(reason?: any): Promise<void>
    close(): Promise<void>
    getWriter(): any
  }

  interface TransformStream<I = any, O = any> {
    readonly readable: ReadableStream<O>
    readonly writable: WritableStream<I>
  }

  interface ByteLengthQueuingStrategy {
    readonly highWaterMark: number
    readonly size: Function
  }

  interface CountQueuingStrategy {
    readonly highWaterMark: number
    readonly size: Function
  }

  class Blob {
    constructor(parts?: (string | Uint8Array | Blob | ArrayBuffer)[], options?: { type?: string })
    readonly size: number
    readonly type: string
    text(): Promise<string>
    arrayBuffer(): Promise<ArrayBuffer>
    slice(start?: number, end?: number, contentType?: string): Blob
  }

  class Headers {
    constructor(init?: Record<string, string> | [string, string][] | Headers)
    get(name: string): string | null
    set(name: string, value: string): void
    has(name: string): boolean
    append(name: string, value: string): void
    delete(name: string): void
    entries(): IterableIterator<[string, string]>
    keys(): IterableIterator<string>
    values(): IterableIterator<string>
    forEach(fn: (value: string, key: string) => void): void
    [Symbol.iterator](): IterableIterator<[string, string]>
  }

  class FormData {
    append(name: string, value: string | Uint8Array | Blob, filename?: string): void
    get(name: string): string | Blob | null
    getAll(name: string): (string | Blob)[]
    has(name: string): boolean
    set(name: string, value: string | Uint8Array | Blob, filename?: string): void
    delete(name: string): void
    entries(): IterableIterator<[string, string | Blob]>
  }

  class URLSearchParams {
    constructor(init?: string | Record<string, string> | [string, string][])
    append(name: string, value: string): void
    get(name: string): string | null
    getAll(name: string): string[]
    has(name: string): boolean
    set(name: string, value: string): void
    delete(name: string): void
    toString(): string
    entries(): IterableIterator<[string, string]>
    keys(): IterableIterator<string>
    values(): IterableIterator<string>
    [Symbol.iterator](): IterableIterator<[string, string]>
  }

  interface FetchRequestInit {
    method?: string
    headers?: Record<string, string> | Headers
    body?: string | Uint8Array | ReadableStream<Uint8Array> | FormData | URLSearchParams | Blob
    timeout?: number
  }

  interface FetchResponse {
    readonly ok: boolean
    readonly status: number
    readonly statusText: string
    readonly headers: Headers
    readonly bodyUsed: boolean
    text(): Promise<string>
    json(): Promise<unknown>
    blob(): Promise<Blob>
    body(): ReadableStream<Uint8Array>
  }

  class Request {
    constructor(input: string | Request, init?: FetchRequestInit)
    readonly url: string
    readonly method: string
    readonly headers: Headers
    readonly body: ReadableStream<Uint8Array> | null
    readonly bodyUsed: boolean
    text(): Promise<string>
    json(): Promise<unknown>
    blob(): Promise<Blob>
  }

  function fetch(input: string | Request, init?: FetchRequestInit): Promise<FetchResponse>
}

// Top-level type aliases so rune API .d.ts files can reference these types
// without namespace qualification. walkUtilsDocs ignores type aliases (kind 4194304),
// so TypeDoc documentation output is unaffected.
type AbortSignal = globals.AbortSignal
type AbortController = globals.AbortController
type ReadableStream<R = any> = globals.ReadableStream<R>
type WritableStream<W = any> = globals.WritableStream<W>
type TransformStream<I = any, O = any> = globals.TransformStream<I, O>
type ByteLengthQueuingStrategy = globals.ByteLengthQueuingStrategy
type CountQueuingStrategy = globals.CountQueuingStrategy
type Blob = globals.Blob
type Headers = globals.Headers
type FormData = globals.FormData
type URLSearchParams = globals.URLSearchParams
type Request = globals.Request
