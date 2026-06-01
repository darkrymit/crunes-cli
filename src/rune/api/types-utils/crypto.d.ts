/** Cryptographic hashing and random value generation */
declare namespace crypto {
  /**
   * Hashes data and returns raw Uint8Array bytes.
   * @param algorithm Hash algorithm e.g. sha256, md5
   * @param data String or Uint8Array binary data to hash
   */
  function hash(algorithm: string, data: string | Uint8Array): Promise<Uint8Array>

  /**
   * Hashes data and returns a hex string. Supports binary data.
   * @param algorithm Hash algorithm e.g. sha256, md5
   * @param data String or Uint8Array binary data to hash
   */
  function hashAsHex(algorithm: string, data: string | Uint8Array): Promise<string>

  /**
   * Hashes data and returns a base64 string. Supports binary data.
   * @param algorithm Hash algorithm
   * @param data String or Uint8Array binary data to hash
   */
  function hashAsBase64(algorithm: string, data: string | Uint8Array): Promise<string>

  /** Generates a random UUID v4 */
  function uuid(): string

  /** Generates cryptographically secure random bytes as a hex string */
  function randomHex(size: number): string

  /** Generates cryptographically secure random bytes as a base64 string */
  function randomBase64(size: number): string

  /** Generates cryptographically secure random bytes as a Uint8Array */
  function randomBytes(size: number): Uint8Array

  /**
   * Generates an HMAC signature and returns raw Uint8Array bytes.
   * @param algorithm Hash algorithm e.g. sha256, sha512
   * @param key Signing key (string or raw bytes)
   * @param data Data to sign (string or raw bytes)
   */
  function hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array>

  /**
   * Generates an HMAC signature and returns it as a Hex string.
   * @param algorithm Hash algorithm
   * @param key Signing key
   * @param data Data to sign
   */
  function hmacAsHex(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<string>

  /**
   * Generates an HMAC signature and returns it as a Base64 string.
   * @param algorithm Hash algorithm
   * @param key Signing key
   * @param data Data to sign
   */
  function hmacAsBase64(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<string>

  /**
   * Encrypts data using AES and returns raw Uint8Array bytes.
   * For GCM, the authentication tag is appended to the ciphertext.
   * @param algorithm Symmetric encryption algorithm
   * @param key Secret key (must match algorithm size requirements)
   * @param iv Initialization Vector
   * @param data Plaintext data to encrypt
   */
  function encrypt(algorithm: string, key: string | Uint8Array, iv: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array>

  /**
   * Decrypts ciphertext using AES and returns raw decrypted Uint8Array bytes.
   * For GCM, the authentication tag is expected at the end of the ciphertext.
   * @param algorithm Symmetric encryption algorithm
   * @param key Secret key
   * @param iv Initialization Vector
   * @param ciphertext Ciphertext bytes to decrypt
   */
  function decrypt(algorithm: string, key: string | Uint8Array, iv: string | Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array>

  /**
   * Hashes a stream of Uint8Array chunks, yielding a single Uint8Array chunk containing the hash digest at the end.
   * @param algorithm Hash algorithm e.g. 'sha256', 'md5'
   */
  function hashStream(algorithm: string): TransformStream<Uint8Array, Uint8Array>

  /**
   * Encrypts a stream of raw bytes.
   * For AEAD algorithms like GCM, the authentication tag is automatically appended to the very end of the stream.
   * @param algorithm Symmetric encryption algorithm e.g. 'aes-256-gcm'
   * @param key Secret key buffer
   * @param iv Initialization Vector buffer
   */
  function encryptStream(algorithm: string, key: Uint8Array, iv: Uint8Array): TransformStream<Uint8Array, Uint8Array>

  /**
   * Decrypts a stream of encrypted bytes.
   * For AEAD algorithms like GCM, the authentication tag is expected at the end of the input stream.
   * @param algorithm Symmetric encryption algorithm e.g. 'aes-256-gcm'
   * @param key Secret key buffer
   * @param iv Initialization Vector buffer
   */
  function decryptStream(algorithm: string, key: Uint8Array, iv: Uint8Array): TransformStream<Uint8Array, Uint8Array>
}

