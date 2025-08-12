import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { mkdirp, remove, spawnPromise, uuid, writeFile } from '../../Fn'
import { isMacOS, isWindows } from '@shared/utils'

class Code extends Base {
  constructor() {
    super()
    this.type = 'code'
  }

  codeRun(code: string, type: string, path: string) {
    console.log('codeRun: ', Math.round(new Date().getTime() / 1000))
    console.time('codeRun')
    return new ForkPromise(async (resolve, reject) => {
      const runDir = join(global.Server.Cache!, uuid())
      await mkdirp(runDir)
      const doExec = async (shFile: string) => {
        const psName = basename(shFile)
        const baseDir = runDir
        process.chdir(baseDir)
        console.timeLog('codeRun', 'befor exec')
        if (isWindows()) {
          try {
            const res = await spawnPromise(
              'powershell.exe',
              [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                `"Unblock-File -LiteralPath './${psName}'; & './${psName}'"`
              ],
              {
                shell: 'powershell.exe',
                cwd: baseDir
              }
            )
            const data = (res.stdout + '\n' + res.stderr).trim()
            resolve(data)
          } catch (e) {
            reject(e)
          } finally {
            await remove(runDir)
          }
        } else {
          const shell = isMacOS() ? 'zsh' : 'bash'
          try {
            const res = await spawnPromise(shell, [psName], {
              cwd: baseDir
            })
            const data = (res.stdout + '\n' + res.stderr).trim()
            resolve(data)
            console.timeLog('codeRun', 'after exec')
            console.timeEnd('codeRun')
          } catch (e) {
            reject(e)
          } finally {
            await remove(runDir)
          }
        }
      }

      let shFile = ''
      if (type === 'typescript') {
        const file = join(runDir, `${uuid()}.ts`)
        await writeFile(file, code)
        if (isWindows()) {
          const isNode = [join(path, 'node.exe'), join(path, 'bin/node.exe')].some((f) =>
            existsSync(f)
          )
          shFile = join(runDir, `${uuid()}.ps1`)
          let shContent = ``
          if (isNode) {
            shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
if (-not (Get-Command tsx -ErrorAction SilentlyContinue)) {
    npm install -g tsx > $null 2>&1
}
tsx "${file}"
`
          } else {
            const isBun = [join(path, 'bun.exe'), join(path, 'bin/bun.exe')].some((f) =>
              existsSync(f)
            )
            const bin = isBun ? 'bun' : 'deno'
            shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
${bin} run "${file}"
`
          }
          await writeFile(shFile, shContent)
        } else {
          const isNode = [join(path, 'node'), join(path, 'bin/node')].some((f) => existsSync(f))
          shFile = join(runDir, `${uuid()}.sh`)
          let shContent = ``
          if (isNode) {
            shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
if ! command -v tsx &> /dev/null; then
    npm install -g tsx > /dev/null 2>&1
fi
tsx "${file}"
`
          } else {
            const isBun = [join(path, 'bun'), join(path, 'bin/bun')].some((f) => existsSync(f))
            const bin = isBun ? 'bun' : 'deno'
            shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
${bin} run "${file}"
`
          }
          await writeFile(shFile, shContent)
        }
        await doExec(shFile)
      }
      // javascript
      else if (type === 'javascript') {
        const file = join(runDir, `${uuid()}.js`)
        await writeFile(file, code)
        if (isWindows()) {
          const isNode = [join(path, 'node.exe'), join(path, 'bin/node.exe')].some((f) =>
            existsSync(f)
          )
          shFile = join(runDir, `${uuid()}.ps1`)
          let shContent = ``
          if (isNode) {
            shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
node "${file}"
`
          } else {
            const isBun = [join(path, 'bun.exe'), join(path, 'bin/bun.exe')].some((f) =>
              existsSync(f)
            )
            const bin = isBun ? 'bun' : 'deno'
            shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
${bin} run "${file}"
`
          }
          await writeFile(shFile, shContent)
        } else {
          const isNode = [join(path, 'node'), join(path, 'bin/node')].some((f) => existsSync(f))
          shFile = join(runDir, `${uuid()}.sh`)
          let shContent = ``
          if (isNode) {
            shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
node "${file}"
`
          } else {
            const isBun = [join(path, 'bun'), join(path, 'bin/bun')].some((f) => existsSync(f))
            const bin = isBun ? 'bun' : 'deno'
            shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
${bin} run "${file}"
`
          }
          await writeFile(shFile, shContent)
        }
        await doExec(shFile)
      }
    })
  }
}
export default new Code()
