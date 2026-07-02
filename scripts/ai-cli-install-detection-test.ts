import assert from 'node:assert/strict'
import { win32 } from 'node:path'
import {
  buildAiCliBinCandidates,
  checkAiCliVersion,
  resolveAiCliCommand,
  resolveAiCliTerminalCommand
} from '../src/fork/util/AiCli'

async function main() {
  const unixCandidates = buildAiCliBinCandidates('codex', {
    isWindows: false,
    homeDir: '/Users/flyenv'
  })
  assert.ok(unixCandidates.includes('/Users/flyenv/.local/bin/codex'))
  assert.ok(unixCandidates.includes('/Users/flyenv/.npm-global/bin/codex'))
  assert.ok(unixCandidates.includes('/opt/homebrew/bin/codex'))

  const windowsCandidates = buildAiCliBinCandidates('copilot', {
    isWindows: true,
    env: {
      APPDATA: 'C:\\Users\\FlyEnv\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\FlyEnv\\AppData\\Local',
      USERPROFILE: 'C:\\Users\\FlyEnv'
    }
  })
  assert.ok(
    windowsCandidates.includes(
      'C:\\Users\\FlyEnv\\AppData\\Roaming\\npm\\copilot.cmd'
    )
  )
  assert.ok(
    windowsCandidates.includes(
      'C:\\Users\\FlyEnv\\AppData\\Local\\Microsoft\\WinGet\\Links\\copilot.exe'
    )
  )

  const resolved = resolveAiCliCommand('hermes', {
    isWindows: false,
    homeDir: '/Users/flyenv',
    extraCandidates: ['/Users/flyenv/.local/bin/hermes'],
    existsSync: (filePath) => filePath === '/Users/flyenv/.local/bin/hermes'
  })
  assert.equal(resolved, '"/Users/flyenv/.local/bin/hermes"')

  let cleanCalled = 0
  const commands: string[] = []
  const version = await checkAiCliVersion('codex', {
    isWindows: false,
    homeDir: '/Users/flyenv',
    extraCandidates: ['/Users/flyenv/.local/bin/codex'],
    existsSync: (filePath) => filePath === '/Users/flyenv/.local/bin/codex',
    cleanEnv: () => {
      cleanCalled += 1
    },
    execPromiseWithEnv: async (command: string) => {
      commands.push(command)
      if (command === 'codex --version') {
        throw new Error('not found')
      }
      if (command === '"/Users/flyenv/.local/bin/codex" --version') {
        return {
          stdout: 'codex 1.2.3\n',
          stderr: ''
        }
      }
      throw new Error(`unexpected command: ${command}`)
    }
  })
  assert.equal(cleanCalled, 1)
  assert.equal(version, 'codex 1.2.3')
  assert.deepEqual(commands, ['codex --version', '"/Users/flyenv/.local/bin/codex" --version'])

  const quotedWindows = resolveAiCliCommand('copilot', {
    isWindows: true,
    env: {
      APPDATA: 'C:\\Users\\FlyEnv\\AppData\\Roaming'
    },
    existsSync: (filePath) =>
      filePath === win32.join('C:\\Users\\FlyEnv\\AppData\\Roaming', 'npm', 'copilot.cmd')
  })
  assert.equal(quotedWindows, '"C:\\Users\\FlyEnv\\AppData\\Roaming\\npm\\copilot.cmd"')

  const powerShellWindows = resolveAiCliTerminalCommand('copilot', {
    isWindows: true,
    env: {
      APPDATA: 'C:\\Users\\FlyEnv\\AppData\\Roaming'
    },
    existsSync: (filePath) =>
      filePath === win32.join('C:\\Users\\FlyEnv\\AppData\\Roaming', 'npm', 'copilot.cmd')
  })
  assert.equal(powerShellWindows, '& "C:\\Users\\FlyEnv\\AppData\\Roaming\\npm\\copilot.cmd"')

  console.log('ai cli install detection test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
