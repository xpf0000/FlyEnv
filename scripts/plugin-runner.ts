import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPlugin } from './plugin-builder'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const mode = process.argv[2]
const name = process.argv[3]

if (!['dev', 'debug'].includes(mode) || !name) {
  throw new Error('Usage: yarn plugin:dev <plugin-name> or yarn plugin:debug <plugin-name>')
}

const outputRoot =
  mode === 'dev'
    ? path.resolve(root, 'tmp/plugins', name)
    : path.resolve(root, 'dist/plugins', name)

if (mode === 'dev') {
  await buildPlugin(name, { outputRoot, minify: false })
}

const child = spawn(process.platform === 'win32' ? 'yarn.cmd' : 'yarn', ['dev'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    FLYENV_PLUGIN_PATH: outputRoot,
    FLYENV_PLUGIN_MODE: mode
  }
})

child.on('exit', (code) => process.exit(code ?? 0))
