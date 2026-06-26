import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { SoftInstalled } from '@shared/app'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { mkdirp, remove, spawnPromiseWithEnv, uuid, writeFile } from '../../Fn'
import { isMacOS, isWindows } from '@shared/utils'
import EnvSync from '@shared/EnvSync'
import { powerShellInlineArgs } from '@shared/PowerShellCommand'

type CodeRunPlatform = NodeJS.Platform

type CodeRunInlineScriptOptions = {
  type: string
  runtimePath: string
  sourceFile: string
  runDir: string
  platform?: CodeRunPlatform
  exists?: (file: string) => boolean
}

function trimTrailingSeparator(value: string): string {
  return value.replace(/[\\/]+$/, '')
}

function targetJoin(base: string, name: string, platform: CodeRunPlatform): string {
  const sep = platform === 'win32' ? '\\' : '/'
  return `${trimTrailingSeparator(base)}${sep}${name}`
}

function powerShellDoubleQuoted(value: string): string {
  return `"${value.replace(/`/g, '``').replace(/"/g, '`"').replace(/\$/g, '`$')}"`
}

function shellDoubleQuoted(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')}"`
}

function shellDoubleQuotedPathPrefix(paths: string[]): string {
  const escaped = paths
    .map((item) =>
      item.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')
    )
    .join(':')
  return `"${escaped}:$PATH"`
}

function hasRuntimeBinary(
  runtimePath: string,
  name: string,
  platform: CodeRunPlatform,
  exists: (file: string) => boolean
): boolean {
  const binName = platform === 'win32' ? `${name}.exe` : name
  return [
    targetJoin(runtimePath, binName, platform),
    targetJoin(targetJoin(runtimePath, 'bin', platform), binName, platform)
  ].some((file) => exists(file))
}

function pathSetupLine(runtimePath: string, platform: CodeRunPlatform): string {
  const binPath = targetJoin(runtimePath, 'bin', platform)
  if (platform === 'win32') {
    return `$env:PATH = ${powerShellDoubleQuoted(`${binPath};${runtimePath};`)} + $env:PATH`
  }
  return `export PATH=${shellDoubleQuotedPathPrefix([binPath, runtimePath])}`
}

export function buildCodeRunInlineScript(options: CodeRunInlineScriptOptions): string {
  const platform = options.platform ?? process.platform
  const exists = options.exists ?? existsSync
  const win = platform === 'win32'
  const runtimePath = options.runtimePath
  const file = options.sourceFile
  const runDir = options.runDir
  const lines = [pathSetupLine(runtimePath, platform)]
  const commandFile = win ? powerShellDoubleQuoted(file) : shellDoubleQuoted(file)

  const hasNode = hasRuntimeBinary(runtimePath, 'node', platform, exists)
  const hasBun = hasRuntimeBinary(runtimePath, 'bun', platform, exists)
  const jsRuntime = hasNode ? 'node' : hasBun ? 'bun' : 'deno'

  if (options.type === 'typescript') {
    if (hasNode) {
      if (win) {
        lines.push(
          'if (-not (Get-Command tsx -ErrorAction SilentlyContinue)) {',
          '    npm install -g tsx > $null 2>&1',
          '}',
          `tsx ${commandFile}`
        )
      } else {
        lines.push(
          'if ! command -v tsx > /dev/null 2>&1; then',
          '    npm install -g tsx > /dev/null 2>&1',
          'fi',
          `tsx ${commandFile}`
        )
      }
    } else {
      lines.push(`${jsRuntime} run ${commandFile}`)
    }
  } else if (options.type === 'javascript') {
    if (hasNode) {
      lines.push(`node ${commandFile}`)
    } else {
      lines.push(`${jsRuntime} run ${commandFile}`)
    }
  } else if (options.type === 'php') {
    lines.push(`php ${commandFile}`)
  } else if (options.type === 'java') {
    lines.push(`javac ${commandFile}`)
    if (win) {
      lines.push(`if ($LASTEXITCODE -eq 0) { java -cp ${powerShellDoubleQuoted(runDir)} Main }`)
    } else {
      lines.push(`if [ $? -eq 0 ]; then java -cp ${shellDoubleQuoted(runDir)} Main; fi`)
    }
  } else if (options.type === 'golang') {
    lines.push(
      win ? '$env:GO111MODULE = "auto"' : 'export GO111MODULE=auto',
      `go run ${commandFile}`
    )
  } else if (options.type === 'rust') {
    const outFile = targetJoin(runDir, win ? 'main.exe' : 'main', platform)
    lines.push(
      `rustc ${commandFile} -o ${win ? powerShellDoubleQuoted(outFile) : shellDoubleQuoted(outFile)}`
    )
    if (win) {
      lines.push(`if ($LASTEXITCODE -eq 0) { & ${powerShellDoubleQuoted(outFile)} }`)
    } else {
      lines.push(`if [ $? -eq 0 ]; then ${shellDoubleQuoted(outFile)}; fi`)
    }
  } else if (options.type === 'erlang') {
    lines.push('erl -compile main', 'erl -noshell -s main main -s init stop')
  } else if (options.type === 'python') {
    lines.push(`${win ? 'python' : 'python3'} ${commandFile}`)
  } else if (options.type === 'ruby') {
    lines.push(`ruby ${commandFile}`)
  } else if (options.type === 'perl') {
    lines.push(`perl ${commandFile}`)
  } else {
    throw new Error(`Unsupported language: ${options.type}`)
  }

  return lines.join('\n')
}

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

      const doExec = async (script: string) => {
        process.chdir(runDir)
        console.timeLog('codeRun', 'befor exec')
        try {
          let res: { stdout: string; stderr: string }
          if (isWindows()) {
            await EnvSync.sync()
            res = await spawnPromiseWithEnv(
              EnvSync.PowerShellPath || 'powershell.exe',
              powerShellInlineArgs(script),
              {
                cwd: runDir,
                windowsHide: true
              }
            )
          } else {
            const shell = isMacOS() ? '/bin/zsh' : '/bin/bash'
            res = await spawnPromiseWithEnv(shell, ['-lc', script], {
              cwd: runDir
            })
          }
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

      let sourceFile = ''
      try {
        if (type === 'typescript') {
          sourceFile = join(runDir, `${uuid()}.ts`)
          await writeFile(sourceFile, code)
        } else if (type === 'javascript') {
          sourceFile = join(runDir, `${uuid()}.js`)
          await writeFile(sourceFile, code)
        } else if (type === 'php') {
          sourceFile = join(runDir, `${uuid()}.php`)
          await writeFile(sourceFile, code.includes('<?php') ? code : `<?php\n${code}`)
        } else if (type === 'java') {
          sourceFile = join(runDir, 'Main.java')
          await writeFile(sourceFile, code)
        } else if (type === 'golang') {
          sourceFile = join(runDir, 'main.go')
          await writeFile(sourceFile, code)
        } else if (type === 'rust') {
          sourceFile = join(runDir, 'main.rs')
          await writeFile(sourceFile, code)
        } else if (type === 'erlang') {
          sourceFile = join(runDir, 'main.erl')
          await writeFile(sourceFile, code)
        } else if (type === 'python') {
          sourceFile = join(runDir, 'main.py')
          await writeFile(sourceFile, code)
        } else if (type === 'ruby') {
          sourceFile = join(runDir, 'main.rb')
          await writeFile(sourceFile, code)
        } else if (type === 'perl') {
          sourceFile = join(runDir, 'main.pl')
          await writeFile(sourceFile, code)
        } else {
          throw new Error(`Unsupported language: ${type}`)
        }

        await doExec(
          buildCodeRunInlineScript({
            type,
            runtimePath: path,
            sourceFile,
            runDir
          })
        )
      } catch (e) {
        reject(e)
        await remove(runDir)
      }
    })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // Code 模块仅临时生成运行文件，执行后立即清理，没有持久化配置文件
    return []
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // Code 模块不输出持久化日志文件
    return []
  }
}
export default new Code()
