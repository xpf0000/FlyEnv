import path from 'path'
import Launcher from './Launcher'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))

global.__static = path.resolve(__dirname, 'static/').replace(/\\/g, '\\\\')
global.launcher = new Launcher()

export default () => {}
