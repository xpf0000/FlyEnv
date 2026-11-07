// Test-only process adapter. Package execution, main admission, IPC and renderer remain real.
import { Base } from '../../src/fork/module/Base'
import { ForkPromise } from '../../src/shared/ForkPromise'
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
class SmokePhp extends Base {
  constructor() {
    super()
    this.type = 'php'
  }
  brewinfo() {
    return new ForkPromise((resolve) =>
      resolve([{ name: 'homebrew/core/php', version: '8.5.12', installed: true, flag: 'brew' }])
    )
  }
  allInstalledVersions() {
    return new ForkPromise((resolve) => {
      const root = process.env.BREW_SMOKE_ROOT!
      const version = existsSync(join(root, 'upgraded')) ? '8.5.12' : '8.5.7'
      resolve([
        {
          bin: join(root, 'prefix/Cellar/php', version, 'sbin/php-fpm'),
          path: join(root, 'prefix/Cellar/php', version),
          version,
          enable: true,
          source: 'Homebrew',
          run: false,
          running: false,
          num: 85
        }
      ])
    })
  }
  _stopServer(version: any) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const root = process.env.BREW_SMOKE_ROOT!
        if (existsSync(join(root, 'fail-stop'))) throw new Error('fixture stop failure')
        const allowed = JSON.parse(readFileSync(join(root, 'service-pids.json'), 'utf8'))
        if (!allowed.includes(Number(version.pid))) throw new Error('Not an isolated fixture PID')
        process.kill(Number(version.pid), 'SIGTERM')
        for (let i = 0; i < 80; i++) {
          try {
            process.kill(Number(version.pid), 0)
          } catch {
            appendFileSync(join(root, 'events'), 'stopped\n')
            resolve({ 'APP-Service-Stop-PID': [String(version.pid)] })
            return
          }
          await new Promise((r) => setTimeout(r, 50))
        }
        throw new Error('fixture process still alive')
      } catch (error) {
        reject(error)
      }
    })
  }
}
export default new SmokePhp()
