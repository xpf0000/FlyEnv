import assert from 'node:assert/strict'
import * as identity from '../src/shared/WindowsHelperIdentity'

async function main() {
  assert.equal(typeof (identity as any).windowsPowerShellPath, 'function')
  assert.equal(
    (identity as any).windowsPowerShellPath('D:\\WINNT'),
    'D:\\WINNT\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  )
  if (process.platform === 'win32') {
    const previous = process.env.ProgramData
    try {
      process.env.ProgramData = 'Z:\\not-the-system-program-data'
      const current = await identity.getWindowsHelperIdentity()
      assert.ok(
        !current.instanceRoot.startsWith('Z:'),
        'identity must use the Windows known folder'
      )
    } finally {
      if (previous === undefined) delete process.env.ProgramData
      else process.env.ProgramData = previous
    }
  }
  console.log('windows-helper-powershell-test: ok')
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
