import { app } from 'electron'
import {
  resolveAppResourcePath,
  resolveElectronResourcePath,
  resolveRendererResourcePath
} from './AppResourcePath'

export const getAppResourcePath = (...segments: string[]) => {
  return resolveAppResourcePath(app.getAppPath(), ...segments)
}

export const getElectronResourcePath = (...segments: string[]) => {
  return resolveElectronResourcePath(app.getAppPath(), ...segments)
}

export const getRendererResourcePath = (...segments: string[]) => {
  return resolveRendererResourcePath(app.getAppPath(), ...segments)
}
