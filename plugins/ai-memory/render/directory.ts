export async function openMemoryDirectory(
  openPath: (path: string) => Promise<unknown>,
  path: string
): Promise<void> {
  const result = await openPath(path)
  // FlyEnv's shell bridge acknowledges dispatch with true; Electron returns an empty string.
  if (result !== true && result !== '') throw new Error('directory_unavailable')
}
