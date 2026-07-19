import is from 'electron-is'
import { ViteDevPort } from '../../../configs/vite.port'
import { getRendererResourcePath } from '../utils/AppRuntimePath'
import BrowserWindowConstructorOptions = Electron.BrowserWindowConstructorOptions

const index = getRendererResourcePath('index.html')
const tray = getRendererResourcePath('tray.html')

interface PageOptions {
  [key: string]: {
    attrs: BrowserWindowConstructorOptions
    bindCloseToHide: boolean
    url: string
  }
}

const options: PageOptions = {
  index: {
    attrs: {
      title: 'FlyEnv',
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600
    },
    bindCloseToHide: true,
    url: is.dev() ? `http://localhost:${ViteDevPort}` : index
  },
  tray: {
    attrs: {},
    bindCloseToHide: true,
    url: is.dev() ? `http://localhost:${ViteDevPort}/tray.html` : tray
  }
}

export default options
