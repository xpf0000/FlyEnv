export async function openDirectoryPath(
  path: string,
  validate: (path: string) => Promise<unknown>,
  open: (path: string) => Promise<unknown>
): Promise<void> {
  await validate(path)
  const result = await open(path)
  // The host currently acknowledges dispatch with true. Newer hosts may expose
  // Electron's empty-string/error-string result. Neither contract is an OS UI check.
  if (result === true || result === '') return
  throw new Error(typeof result === 'string' && result ? result : 'pathOpenFailed')
}
