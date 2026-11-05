import assert from 'node:assert/strict'
import { exec as execCallback } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createContext, runInContext } from 'node:vm'
import typescript from 'typescript'
import { ForkPromise } from '../src/shared/ForkPromise'

const exec = promisify(execCallback)
const compiled =
  ['../src/fork/module/Tool/shellProfiles.ts', '../src/fork/module/Flutter/android.ts']
    .map(
      (file) =>
        typescript.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
          compilerOptions: {
            target: typescript.ScriptTarget.ESNext,
            module: typescript.ModuleKind.ESNext
          }
        }).outputText
    )
    .join('\n')
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+/gm, '') + '\nthis.androidMethods = androidMethods;'

async function fixture(macOS: boolean) {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-flutter-android-'))
  const home = join(root, 'home')
  const sdkDir = join(root, 'Android', 'Sdk')
  const platformToolsDir = join(sdkDir, 'platform-tools')
  await mkdir(home, { recursive: true })
  await mkdir(platformToolsDir, { recursive: true })
  const context = createContext({
    global: { Server: { UserHome: home } },
    process: { env: { PATH: process.env.PATH ?? '' } },
    join,
    existsSync,
    ForkPromise,
    addPath: async () => true,
    execPromiseWithEnv: (command: string) =>
      exec(command, { env: { ...process.env, HOME: home }, shell: '/bin/bash' }),
    getSubDirAsync: async () => [],
    isLinux: () => !macOS,
    isMacOS: () => macOS,
    isWindows: () => false,
    appDebugLog: async () => undefined,
    userInfo: () => ({ homedir: home }),
    notifyWindowsEnvironmentChanged: () => undefined,
    readFileByRoot: (path: string) => readFile(path, 'utf8'),
    writeFileByRoot: async (path: string, content: string) => {
      await writeFile(path, content)
      return true
    }
  })
  runInContext(compiled, context)
  const android = Object.create(context.androidMethods)
  android._detectAndroidSdkDir = () => sdkDir
  return {
    root,
    home,
    sdkDir,
    platformToolsDir,
    fix: (action: 'set-sdk-env' | 'add-platform-tools-path') => android.androidAutoFix(action)
  }
}

function assertLine(content: string, line: string) {
  assert.equal(content.split('\n').filter((item) => item === line).length, 1)
}

for (const action of ['set-sdk-env', 'add-platform-tools-path'] as const) {
  for (const failedProfile of ['.bashrc', '.zshrc']) {
    const { root, home, sdkDir, platformToolsDir, fix } = await fixture(false)
    const updatedProfile = failedProfile === '.bashrc' ? '.zshrc' : '.bashrc'
    try {
      await mkdir(join(home, failedProfile))
      await writeFile(join(home, updatedProfile), '# shell\n')
      const result = await fix(action)
      assert.equal(result.ok, false)
      assert.match(result.results[0].message, /Updated:.*\.(?:bashrc|zshrc)/)
      const content = await readFile(join(home, updatedProfile), 'utf8')
      if (action === 'set-sdk-env') {
        assertLine(content, `export ANDROID_HOME="${sdkDir}"`)
        assertLine(content, `export ANDROID_SDK_ROOT="${sdkDir}"`)
      } else {
        assertLine(content, `export PATH="${platformToolsDir}:$PATH"`)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
}

for (const macOS of [false, true]) {
  const { root, home, sdkDir, platformToolsDir, fix } = await fixture(macOS)
  try {
    await writeFile(join(home, '.zshrc'), '# zsh')
    if (!macOS) await writeFile(join(home, '.bashrc'), '# bash\n')
    await fix('set-sdk-env')
    await fix('set-sdk-env')
    await fix('add-platform-tools-path')
    await fix('add-platform-tools-path')
    const profiles = macOS ? ['.zshrc'] : ['.bashrc', '.zshrc']
    for (const profile of profiles) {
      const content = await readFile(join(home, profile), 'utf8')
      assertLine(content, `export ANDROID_HOME="${sdkDir}"`)
      assertLine(content, `export ANDROID_SDK_ROOT="${sdkDir}"`)
      assertLine(content, `export PATH="${platformToolsDir}:$PATH"`)
    }
    assert.equal(existsSync(join(home, '.bashrc')), !macOS)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

console.log('Flutter Android: independent profile failures, macOS scope and idempotency passed.')
