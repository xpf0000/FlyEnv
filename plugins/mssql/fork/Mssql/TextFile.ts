/** SQL Server ERRORLOG is UTF-16LE; keep ordinary UTF-8 files unchanged. */
export const decodeTextFile = (content: Buffer): string => {
  if (content[0] === 0xff && content[1] === 0xfe) {
    return content.subarray(2).toString('utf16le')
  }
  // Clearing the original log can remove its BOM. SQL Server appends a date header.
  if (/^\d{4}-\d{2}-\d{2}$/.test(content.subarray(0, 20).toString('utf16le'))) {
    return content.toString('utf16le')
  }
  return content.toString('utf8')
}
