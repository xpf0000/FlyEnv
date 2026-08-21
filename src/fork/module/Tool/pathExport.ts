export function parseExportPathEntries(pathExport: string): string[] {
  return pathExport
    .trim()
    .replace(/^export\s+PATH\s*=\s*/, '')
    .replaceAll('"', '')
    .replace('$PATH', '')
    .split(':')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}
