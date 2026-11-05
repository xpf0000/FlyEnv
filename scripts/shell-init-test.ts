import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import typescript from 'typescript'
import { ForkPromise } from '../src/shared/ForkPromise'

const compiled =
  ['shellProfiles.ts', 'init.ts']
    .map(
      (file) =>
        typescript.transpileModule(
          readFileSync(new URL(`../src/fork/module/Tool/${file}`, import.meta.url), 'utf8'),
          {
            compilerOptions: {
              target: typescript.ScriptTarget.ESNext,
              module: typescript.ModuleKind.ESNext
            }
          }
        ).outputText
    )
    .join('\n')
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/\bexport\s+/g, '') + '\nthis.initFlyEnvSH = initFlyEnvSH;'

async function fixture(macOS: boolean) {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-shell-init-'))
  const home = join(root, 'home')
  const staticDir = join(root, 'static')
  const baseDir = join(root, 'base')
  await mkdir(home, { recursive: true })
  await mkdir(join(staticDir, 'sh'), { recursive: true })
  await writeFile(join(staticDir, 'sh/fly-env.sh'), '# test loader\n')
  const context = createContext({
    global: {
      Server: {
        UserHome: home,
        Static: staticDir,
        BaseDir: baseDir,
        AppDir: join(root, 'app')
      }
    },
    existsSync,
    mkdirp: (path: string) => mkdir(path, { recursive: true }),
    readFile,
    readFileByRoot: (path: string) => readFile(path, 'utf8'),
    writeFile,
    writeFileByRoot: async (path: string, content: string) => {
      await writeFile(path, content)
      return true
    },
    dirname,
    join,
    isMacOS: () => macOS,
    ForkPromise
  })
  runInContext(compiled, context)
  return { root, home, init: () => context.initFlyEnvSH() }
}

const sourceLine = /source "[^"]+shell\/flyenv\.sh"/
const sourceLines = new RegExp(sourceLine, 'g')

{
  const { root, home, init } = await fixture(false)
  try {
    await mkdir(join(home, '.bashrc'))
    await writeFile(join(home, '.zshrc'), '# zsh\n')
    await assert.rejects(async () => {
      await init()
    })
    assert.match(await readFile(join(home, '.zshrc'), 'utf8'), sourceLine)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

{
  const { root, home, init } = await fixture(false)
  try {
    await writeFile(join(home, '.bashrc'), '# bash\n')
    await mkdir(join(home, '.zshrc'))
    await assert.rejects(async () => {
      await init()
    })
    assert.match(await readFile(join(home, '.bashrc'), 'utf8'), sourceLine)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

for (const macOS of [false, true]) {
  const { root, home, init } = await fixture(macOS)
  try {
    await writeFile(join(home, '.zshrc'), '# zsh\n')
    if (!macOS) await writeFile(join(home, '.bashrc'), '# bash\n')
    await init()
    await init()
    const zsh = await readFile(join(home, '.zshrc'), 'utf8')
    assert.equal(zsh.match(sourceLines)?.length, 1)
    assert.equal(existsSync(join(home, '.bashrc')), !macOS)
    if (!macOS) {
      const bash = await readFile(join(home, '.bashrc'), 'utf8')
      assert.equal(bash.match(sourceLines)?.length, 1)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

console.log('Shell init: independent profile failures, macOS scope and idempotency passed.')
