import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'

// Exercise the real Tool operations and filesystem without loading IPC/process managers.
const fixture = await mkdtemp(join(tmpdir(), 'flyenv-shell-profiles-'))
const home = posix.join(fixture.replaceAll('\\', '/'), 'home')
const data = posix.join(fixture.replaceAll('\\', '/'), 'FlyEnv')
const previousServer = global.Server
const bundle = await build({
  stdin: {
    contents: `export { handleUpdatePath } from './src/fork/module/Tool/path';
export { setAlias } from './src/fork/module/Tool/alias';`,
    resolveDir: process.cwd(),
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  packages: 'external',
  plugins: [
    {
      name: 'unix-tool-fixture',
      setup(builder) {
        const fixtures: Record<string, string> = {
          '../../Fn': `import fs from 'fs-extra';
export const { existsSync, mkdirp, readdir, remove, chmod, readFile, writeFile } = fs;
export const readFileByRoot = file => fs.readFile(file, 'utf8');
export const writeFileByRoot = (file, content) => fs.writeFile(file, content);
export const removeByRoot = fs.remove;
export const uuid = () => 'alias-id';
export const execPromise = async () => { throw Error('unexpected process execution'); };`,
          '@shared/utils': `export const isMacOS = () => false;
export const isLinux = () => true;
export const appDebugLog = async () => {};
export const defaultShell = () => '#!/bin/sh';`,
          '@shared/EnvSync': 'export default { clean: async () => {} };',
          'shell-env': `export const shellEnv = async () => ({ PATH: global.Server.TestPath });`,
          '../../util/PythonShim': 'export const createPythonBinShims = async () => {};',
          path: `import { posix, resolve as nativeResolve } from 'node:path';
export const { dirname, join } = posix;
export const resolve = (...parts) => nativeResolve(...parts).replaceAll('\\\\', '/');`
        }
        fixtures['node:path'] = fixtures.path
        builder.onResolve({ filter: /./ }, ({ path, namespace }) =>
          namespace !== 'fixture' && path in fixtures ? { path, namespace: 'fixture' } : undefined
        )
        builder.onLoad({ filter: /./, namespace: 'fixture' }, ({ path }) => ({
          contents: fixtures[path],
          loader: 'js',
          resolveDir: process.cwd()
        }))
      }
    }
  ]
})
const loaded = { exports: {} as any }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  createRequire(import.meta.url),
  loaded,
  loaded.exports
)
const { handleUpdatePath, setAlias } = loaded.exports

try {
  await mkdir(home)
  global.Server = {
    UserHome: home,
    AppDir: posix.join(data, 'app'),
    BaseDir: posix.join(data, 'base'),
    TestPath: posix.join(data, 'alias')
  } as any
  await mkdir(posix.join(data, 'alias'), { recursive: true })
  const bash = posix.join(home, '.bashrc')
  const zsh = posix.join(home, '.zshrc')
  await writeFile(bash, '# bash settings\nexport EDITOR=vim\n')
  await writeFile(zsh, '# zsh settings\nexport EDITOR=nano\n')

  const selectedPath = `\nexport PATH="${data}/alias:${data}/env/php/bin:$PATH"\n`
  await handleUpdatePath({ zsh: selectedPath })
  for (const file of [bash, zsh]) {
    assert.ok((await readFile(file, 'utf8')).includes(`${data}/env/php/bin`), file)
  }
  assert.ok((await readFile(bash, 'utf8')).includes('export EDITOR=vim'))
  assert.ok((await readFile(zsh, 'utf8')).includes('export EDITOR=nano'))

  const switchedPath = `\nexport PATH="${data}/alias:${data}/env/node/bin:$PATH"\n`
  await handleUpdatePath({ zsh: switchedPath })
  await handleUpdatePath({ zsh: switchedPath })
  for (const file of [bash, zsh]) {
    const content = await readFile(file, 'utf8')
    assert.ok(content.includes(`${data}/env/node/bin`))
    assert.ok(!content.includes(`${data}/env/php/bin`))
    assert.equal(content.match(/export PATH=/g)?.length, 1, 'updates must be idempotent')
  }
  await handleUpdatePath({ zsh: `\nexport PATH="${data}/alias:$PATH"\n` })
  for (const file of [bash, zsh]) {
    assert.ok(!(await readFile(file, 'utf8')).includes(`${data}/env/`))
  }

  // A PATH inherited from Bash must not bypass repair of the Zsh profile.
  await writeFile(zsh, '# zsh settings\n')
  await setAlias({ bin: '/missing/php' }, undefined, undefined, {})
  assert.ok((await readFile(zsh, 'utf8')).includes(`${data}/alias`))
  await setAlias({ bin: '/missing/php' }, undefined, undefined, {})
  for (const file of [bash, zsh]) {
    assert.equal((await readFile(file, 'utf8')).match(/export PATH=/g)?.length, 1)
  }

  await rm(bash)
  await rm(zsh)
  await handleUpdatePath({ zsh: selectedPath })
  for (const file of [bash, zsh]) {
    assert.ok((await readFile(file, 'utf8')).includes(`${data}/env/php/bin`))
  }

  // One unreadable profile must not prevent the other profile from updating.
  await rm(bash)
  await mkdir(bash)
  await assert.rejects(handleUpdatePath({ zsh: switchedPath }), /\.bashrc/)
  assert.ok((await readFile(zsh, 'utf8')).includes(`${data}/env/node/bin`))
  await rm(bash, { recursive: true })
  await writeFile(bash, '# repaired bash\n')
  await handleUpdatePath({ zsh: switchedPath })
  assert.ok((await readFile(bash, 'utf8')).includes(`${data}/env/node/bin`))

  console.log('Unix shell profile operation regressions passed')
} finally {
  global.Server = previousServer
  await rm(fixture, { recursive: true, force: true })
}
