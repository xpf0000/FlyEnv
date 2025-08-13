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

  /**
   * 代码执行
   * @param code 运行的代码
   * @param type 代码类型
   * @param path 运行代码的二进制文件的路径
   */
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
      let shContent = ``
      if (type === 'typescript') {
        const file = join(runDir, `${uuid()}.ts`)
        await writeFile(file, code)
        if (isWindows()) {
          const isNode = [join(path, 'node.exe'), join(path, 'bin/node.exe')].some((f) =>
            existsSync(f)
          )
          shFile = join(runDir, `${uuid()}.ps1`)
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
      // PHP
      else if (type === 'php') {
        const file = join(runDir, `${uuid()}.php`)
        if (!code.includes('<?php')) {
          await writeFile(file, `<?php\n${code}`)
        } else {
          await writeFile(file, code)
        }
        if (isWindows()) {
          shFile = join(runDir, `${uuid()}.ps1`)
          shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
php "${file}"
`
        } else {
          shFile = join(runDir, `${uuid()}.sh`)
          shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
php "${file}"
`
        }
        await writeFile(shFile, shContent)
        await doExec(shFile)
      }
      // Java
      else if (type === 'java') {
        const file = join(runDir, 'Main.java')
        await writeFile(file, code)
        if (isWindows()) {
          shFile = join(runDir, `${uuid()}.ps1`)
          shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
javac "${file}"
if ($?) {
    java -cp "${runDir}" Main
}
`
        } else {
          shFile = join(runDir, `${uuid()}.sh`)
          shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
javac "${file}"
if [ $? -eq 0 ]; then
    java -cp "${runDir}" Main
fi
`
        }
        await writeFile(shFile, shContent)
        await doExec(shFile)
      }
      // Golang
      else if (type === 'golang') {
        const file = join(runDir, 'main.go')
        await writeFile(file, code)
        if (isWindows()) {
          shFile = join(runDir, `${uuid()}.ps1`)
          shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
$env:GO111MODULE = "auto"
go run "${file}"
`
        } else {
          shFile = join(runDir, `${uuid()}.sh`)
          shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
export GO111MODULE=auto
go run "${file}"
`
        }
        await writeFile(shFile, shContent)
        await doExec(shFile)
      }
      // Rust
      else if (type === 'rust') {
        const file = join(runDir, 'main.rs')
        await writeFile(file, code)
        if (isWindows()) {
          shFile = join(runDir, `${uuid()}.ps1`)
          shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
rustc "${file}" -o "${join(runDir, 'main.exe')}"
if ($?) {
    .\\main.exe
}
`
        } else {
          shFile = join(runDir, `${uuid()}.sh`)
          shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
rustc "${file}" -o "${join(runDir, 'main')}"
if [ $? -eq 0 ]; then
    ./main
fi
`
        }
        await writeFile(shFile, shContent)
        await doExec(shFile)
      }
      // Erlang
      else if (type === 'erlang') {
        const file = join(runDir, 'main.erl')
        await writeFile(file, code)
        if (isWindows()) {
          shFile = join(runDir, `${uuid()}.ps1`)
          shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
erl -compile main
erl -noshell -s main main -s init stop
`
        } else {
          shFile = join(runDir, `${uuid()}.sh`)
          shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
erl -compile main
erl -noshell -s main main -s init stop
`
        }
        await writeFile(shFile, shContent)
        await doExec(shFile)
      }
      // Python
      else if (type === 'python') {
        const file = join(runDir, 'main.py')
        await writeFile(file, code)
        if (isWindows()) {
          shFile = join(runDir, `${uuid()}.ps1`)
          shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
python "${file}"
`
        } else {
          shFile = join(runDir, `${uuid()}.sh`)
          shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
python3 "${file}"
`
        }
        await writeFile(shFile, shContent)
        await doExec(shFile)
      }
      // Ruby
      else if (type === 'ruby') {
        const file = join(runDir, 'main.rb')
        await writeFile(file, code)
        if (isWindows()) {
          shFile = join(runDir, `${uuid()}.ps1`)
          shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
ruby "${file}"
`
        } else {
          shFile = join(runDir, `${uuid()}.sh`)
          shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
ruby "${file}"
`
        }
        await writeFile(shFile, shContent)
        await doExec(shFile)
      }
      // Perl
      else if (type === 'perl') {
        const file = join(runDir, 'main.pl')
        await writeFile(file, code)
        if (isWindows()) {
          shFile = join(runDir, `${uuid()}.ps1`)
          shContent = `$env:PATH = "${join(path, 'bin')};${path};" + $env:PATH
perl "${file}"
`
        } else {
          shFile = join(runDir, `${uuid()}.sh`)
          shContent = `export PATH="${join(path, 'bin')}:${path}:$PATH"
perl "${file}"
`
        }
        await writeFile(shFile, shContent)
        await doExec(shFile)
      }
      // 不支持的语言
      else {
        reject(new Error(`Unsupported language: ${type}`))
        await remove(runDir)
      }
    })
  }
}
export default new Code()
