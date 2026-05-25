/** Compress and extract ZIP and tar.gz archives */
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
   * Extracts a .tar.gz archive to a destination directory.
   * Requires `fs.read:<source>` and `fs.write:<dest>` permissions.
   * @param source Relative path to the .tar.gz file
   * @param dest Relative path to the output directory
   */
  function untar(source: string, dest: string): Promise<void>

  /**
   * Creates a .tar.gz archive from a file or directory.
   * Requires `fs.read:<source>` and `fs.write:<dest>` permissions.
   * @param source Relative path to file or directory
   * @param dest Relative path for the output .tar.gz
   */
  function tar(source: string, dest: string): Promise<void>
}
