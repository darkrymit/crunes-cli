/** Compress and extract ZIP, TAR, and TAR.GZ archives */
declare namespace archive {
  /**
   * Extracts a ZIP archive to a destination directory.
   * Requires `fs.read:<source>` and `fs.write:<dest>` permissions.
   * @param source Relative path to the .zip file
   * @param dest Relative path to the output directory
   */
  function unzip(source: string, dest: string): Promise<void>

  /**
   * Creates a ZIP archive from a file or directory.
   * Requires `fs.read:<source>` and `fs.write:<dest>` permissions.
   * @param source Relative path to file or directory
   * @param dest Relative path for the output .zip
   */
  function zip(source: string, dest: string): Promise<void>

  /**
   * Extracts a TAR archive to a destination directory.
   * Automatically detects gzip compression from the file's magic bytes when `opts.gzip` is omitted.
   * Requires `fs.read:<source>` and `fs.write:<dest>` permissions.
   * @param source Relative path to the .tar or .tar.gz file
   * @param dest Relative path to the output directory
   * @param opts.gzip Force gzip on/off; omit to auto-detect from magic bytes
   */
  function untar(source: string, dest: string, opts?: { gzip?: boolean }): Promise<void>

  /**
   * Creates a TAR archive from a file or directory.
   * Requires `fs.read:<source>` and `fs.write:<dest>` permissions.
   * @param source Relative path to file or directory
   * @param dest Relative path for the output archive
   * @param opts.gzip Gzip-compress the output (default: true)
   */
  function tar(source: string, dest: string, opts?: { gzip?: boolean }): Promise<void>
}
