import { basename, dirname, resolve } from 'node:path'

export const resolveRuntimeAppRoot = (appPath: string) => {
  const normalizedPath = resolve(appPath)
  const isElectronOutputRoot =
    basename(normalizedPath) === 'electron' && basename(dirname(normalizedPath)) === 'dist'
  return isElectronOutputRoot ? resolve(normalizedPath, '../..') : normalizedPath
}

export const resolveAppResourcePath = (appRoot: string, ...segments: string[]) => {
  return resolve(appRoot, ...segments)
}

export const resolveElectronResourcePath = (appRoot: string, ...segments: string[]) => {
  return resolveAppResourcePath(appRoot, 'dist', 'electron', ...segments)
}

export const resolveRendererResourcePath = (appRoot: string, ...segments: string[]) => {
  return resolveAppResourcePath(appRoot, 'dist', 'render', ...segments)
}
