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
    : path.resolve(root, 'dist/plugins', name, manifest.id)

if (mode === 'dev') {
  await buildPlugin(name, { outputRoot, minify: false })
} else if (!(await fs.pathExists(path.join(outputRoot, 'plugin.json')))) {
  throw new Error(`Built plugin not found. Run: yarn plugin:build ${name}`)
}

// Reuse the package manager that invoked this script: npm/yarn/pnpm all set
// npm_execpath to their JS CLI, which node can run directly — no .cmd shim,
// no shell, no EINVAL on Windows. Fall back to npm (bundled with Node) when
// the script is executed outside a package manager.
const userAgent = process.env.npm_config_user_agent ?? ''
const execPath = process.env.npm_execpath
const isWin = process.platform === 'win32'
let command: string
let args: string[]
let shell = false
if (execPath) {
  const pm = userAgent.split('/')[0].toLowerCase()
  const runArgs = pm === 'yarn' || pm === 'pnpm' ? ['dev'] : ['run', 'dev']
  command = process.execPath
  args = [execPath, ...runArgs]
} else {
  command = isWin ? 'npm.cmd' : 'npm'
  args = ['run', 'dev']
  // Windows: .cmd shims are batch files; Node >= 20.12 refuses to spawn them
  // without a shell (EINVAL, CVE-2024-27980 mitigation).
  shell = isWin
}
const child = spawn(command, args, {
  cwd: root,
  stdio: 'inherit',
  shell,
  env: {
    ...process.env,
    FLYENV_PLUGIN_PATH: outputRoot,
    FLYENV_PLUGIN_MODE: mode
  }
})

child.on('exit', (code) => process.exit(code ?? 0))
