import { app } from 'electron'
import {
  resolveAppResourcePath,
  resolveElectronResourcePath,
  resolveRendererResourcePath,
  resolveRuntimeAppRoot
} from './AppResourcePath'

const getRuntimeAppRoot = () => resolveRuntimeAppRoot(app.getAppPath())

export const getAppResourcePath = (...segments: string[]) => {
  return resolveAppResourcePath(getRuntimeAppRoot(), ...segments)
}

export const getElectronResourcePath = (...segments: string[]) => {
  return resolveElectronResourcePath(getRuntimeAppRoot(), ...segments)
}

export const getRendererResourcePath = (...segments: string[]) => {
  return resolveRendererResourcePath(getRuntimeAppRoot(), ...segments)
}
