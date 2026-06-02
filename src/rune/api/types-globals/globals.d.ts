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
   * High-performance string-to-UTF-8 encoder.
   */
  class TextEncoder {
    /** Always "utf-8". */
    readonly encoding: string
    /**
     * Encodes a string into raw UTF-8 bytes.
     *
     * @param str The string to encode.
     */
    encode(str: string): Uint8Array
  }

  /**
   * Decodes UTF-8 bytes into a string.
   */
  class TextDecoder {
    /** The encoding label — always "utf-8" for this implementation. */
    readonly encoding: string
    /** Always false — fatal mode is not supported. */
    readonly fatal: boolean
    /** Always false — BOM stripping is not supported. */
    readonly ignoreBOM: boolean
    /**
     * Creates a new TextDecoder.
     *
     * @param label Encoding label (default: "utf-8"). Only UTF-8 encodings are supported.
     */
    constructor(label?: string)
    /**
     * Decodes raw UTF-8 bytes into a string.
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
    addEventListener(type: 'abort', listener: () => void): void
    removeEventListener(type: 'abort', listener: () => void): void
    dispatchEvent(event: { type: string }): void
    /** Creates a signal that aborts after the given number of milliseconds. */
    static timeout(ms: number): AbortSignal
  }

  /**
   * Provides an AbortSignal that can be used to abort one or more operations.
   */
  class AbortController {
    /** The associated AbortSignal. */
    readonly signal: AbortSignal
    abort(): void
  }

  /** A reader returned by ReadableStream.getReader(). */
  interface ReadableStreamDefaultReader<R = any> {
    /** Resolves when the stream closes or errors. */
    readonly closed: Promise<void>
    /** Read the next chunk. Returns { value, done }. */
    read(): Promise<ReadableStreamReadResult<R>>
    /** Cancel the stream with an optional reason. */
    cancel(reason?: any): Promise<void>
    /** Release the lock on the stream, allowing another reader to acquire it. */
    releaseLock(): void
  }

  interface ReadableStreamReadResult<T> {
    value: T | undefined
    done: boolean
  }

  /** A writer returned by WritableStream.getWriter(). */
  interface WritableStreamDefaultWriter<W = any> {
    /** Resolves when the stream closes or errors. */
    readonly closed: Promise<void>
    /** The number of chunks that can be written before back-pressure applies. */
    readonly desiredSize: number | null
    /** Resolves when it is appropriate to write (i.e. no back-pressure). */
    readonly ready: Promise<void>
    /** Abort the stream with an optional reason. */
    abort(reason?: any): Promise<void>
    /** Close the stream. */
    close(): Promise<void>
    /** Release the lock on the stream. */
    releaseLock(): void
    /** Write a chunk. */
    write(chunk: W): Promise<void>
  }

  interface ReadableStream<R = any> {
    readonly locked: boolean
    cancel(reason?: any): Promise<void>
    getReader(): ReadableStreamDefaultReader<R>
    pipeTo(dest: WritableStream<R>, options?: { preventClose?: boolean; preventAbort?: boolean; preventCancel?: boolean }): Promise<void>
    pipeThrough<T>(transform: TransformStream<R, T>, options?: { preventClose?: boolean; preventAbort?: boolean; preventCancel?: boolean }): ReadableStream<T>
    [Symbol.asyncIterator](): AsyncIterableIterator<R>
  }

  interface WritableStream<W = any> {
    readonly locked: boolean
    abort(reason?: any): Promise<void>
    close(): Promise<void>
    getWriter(): WritableStreamDefaultWriter<W>
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

  /**
   * Transforms a string ReadableStream to a UTF-8 byte ReadableStream.
   */
  class TextEncoderStream {
    readonly readable: ReadableStream<Uint8Array>
    readonly writable: WritableStream<string>
  }

  /**
   * Transforms a UTF-8 byte ReadableStream to a string ReadableStream.
   */
  class TextDecoderStream {
    constructor(label?: string, options?: { fatal?: boolean })
    readonly readable: ReadableStream<string>
    readonly writable: WritableStream<Uint8Array>
  }

  class Blob {
    constructor(parts?: (string | Uint8Array | Blob | ArrayBuffer)[], options?: { type?: string })
    /** Total byte length of the blob. */
    readonly size: number
    /** MIME type of the blob. */
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
    constructor()
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

  /** Options accepted by http.fetch() and global fetch(). */
  interface RequestInit {
    method?: string
    headers?: Record<string, string> | Headers
    body?: string | Uint8Array | ReadableStream<Uint8Array> | FormData | URLSearchParams | Blob
    signal?: AbortSignal
  }

  /** HTTP response — returned by http.fetch() and constructed by http.server() request handlers. */
  class Response {
    constructor(
      body?: string | Uint8Array | ReadableStream<Uint8Array> | Blob | null,
      init?: { status?: number; statusText?: string; headers?: Record<string, string> | Headers }
    )
    readonly ok: boolean
    readonly status: number
    readonly statusText: string
    readonly headers: Headers
    readonly bodyUsed: boolean
    /** The response body as a ReadableStream, or null if there is no body. */
    readonly body: ReadableStream<Uint8Array> | null
    text(): Promise<string>
    json(): Promise<unknown>
    blob(): Promise<Blob>
  }

  class Request {
    constructor(input: string | Request, init?: RequestInit)
    readonly url: string
    readonly method: string
    readonly headers: Headers
    /** The request body as a ReadableStream, or null if there is no body. */
    readonly body: ReadableStream<Uint8Array> | null
    readonly bodyUsed: boolean
    text(): Promise<string>
    json(): Promise<unknown>
    blob(): Promise<Blob>
  }

  /**
   * Makes an HTTP request. Requires `http.fetch:<METHOD>::<url>` permission.
   * Aligns with the Web Fetch API. Also available as `utils.http.fetch()`.
   *
   * @param input Request URL string or Request object.
   * @param init Request options.
   */
  function fetch(input: string | Request, init?: RequestInit): Promise<Response>
}

// Top-level type aliases so rune API .d.ts files can reference these types
// without namespace qualification.
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
type ReadableStreamDefaultReader<R = any> = globals.ReadableStreamDefaultReader<R>
type WritableStreamDefaultWriter<W = any> = globals.WritableStreamDefaultWriter<W>
type Response = globals.Response
