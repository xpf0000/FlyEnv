import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'fs-extra'
import { fileURLToPath } from 'node:url'
import { buildPlugin } from './plugin-builder'
import { validatePluginManifest } from '../src/shared/plugin/PluginManifest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const mode = process.argv[2]
const name = process.argv[3]

if (!['dev', 'debug'].includes(mode) || !name) {
  throw new Error('Usage: yarn plugin:dev <plugin-name> or yarn plugin:debug <plugin-name>')
}

const manifest = validatePluginManifest(
  await fs.readJson(path.resolve(root, 'plugins', name, 'plugin.json'))
)

const outputRoot =
  mode === 'dev'
    ? path.resolve(root, 'tmp/plugins', manifest.id)
    : path.resolve(root, 'tmp/plugins/debug', manifest.id)

if (mode === 'dev') {
  await buildPlugin(name, { outputRoot, minify: false })
} else if (!(await fs.pathExists(path.join(outputRoot, 'plugin.json')))) {
  throw new Error(`Built plugin not found. Run: yarn plugin:build ${name}`)
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
