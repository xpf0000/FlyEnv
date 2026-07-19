import { resolve } from 'node:path'

export const resolveAppResourcePath = (appRoot: string, ...segments: string[]) => {
  return resolve(appRoot, ...segments)
}

export const resolveElectronResourcePath = (appRoot: string, ...segments: string[]) => {
  return resolveAppResourcePath(appRoot, 'dist', 'electron', ...segments)
}

export const resolveRendererResourcePath = (appRoot: string, ...segments: string[]) => {
  return resolveAppResourcePath(appRoot, 'dist', 'render', ...segments)
}
