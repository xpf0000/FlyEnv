import Launcher from './Launcher'
import path from 'path'
global.__static = path.resolve(__dirname, 'static/').replace(/\\/g, '\\\\')
global.launcher = new Launcher()
