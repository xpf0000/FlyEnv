import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, readFile, remove, existsSync, waitTime } from '../../Fn'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuid } from '../../Fn'
import Helper from '../../Helper'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { PItem, ProcessKill, ProcessListFetch, ProcessPidsByPid } from '@shared/Process'
import { ProcessPidList } from '@shared/Process.win'
import { I18nT } from '@lang/index'

class OpenClaw extends Base {
  constructor() {
    super()
    this.type = 'openclaw'
  }

  /**
   * Check if openclaw is installed
   */
  checkInstalled() {
    return new ForkPromise(async (resolve) => {
      let version = ''
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await execPromiseWithEnv(`openclaw --version > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        version = content.trim()
      } catch (e) {
        console.log('openclaw --version error: ', e)
        version = ''
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
      resolve({
        installed: version.length > 0,
        version
      })
    })
  }

  /**
   * Get gateway status
   */
  getGatewayStatus() {
    return new ForkPromise(async (resolve) => {
      let status = ''
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await execPromiseWithEnv(`openclaw gateway status > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        status = content.trim()
      } catch (e) {
        console.log('openclaw gateway status error: ', e)
        status = ''
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }

      // Parse status
      const isInstalled =
        !status.includes('Service: Scheduled Task (missing)') &&
        !status.includes('Service: systemd (disabled)')
      const isRunning = status.includes('RPC probe: ok')
      const isStopped = status.includes('RPC probe: failed')
      const dashboard =
        status
          .split('\n')
          .find((s) => s.includes('Dashboard:'))
          ?.replace('Dashboard:', '')
          ?.trim() ?? ''

      resolve({
        status,
        isInstalled,
        isRunning,
        isStopped,
        dashboard
      })
    })
  }

  /**
   * Install gateway using Helper
   */
  installGateway() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const res: any = await Helper.send('tools', 'exec', 'openclaw gateway install')
        const stdout = res?.stdout ?? ''
        const stderr = res?.stderr ?? ''
        if (stderr && !stdout) {
          reject(stderr)
          return
        }
        resolve(stdout || stderr)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  /**
   * Start gateway using Helper
   */
  startGateway() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`openclaw gateway start`)
      } catch {}
      if (isMacOS()) {
        try {
          await execPromiseWithEnv(
            `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.gateway.plist`
          )
        } catch {}
      }
      if (isLinux()) {
        try {
          await execPromiseWithEnv(
            `export XDG_RUNTIME_DIR=/run/user/$(id -u) && export DBUS_SESSION_BUS_ADDRESS="unix:path=\${XDG_RUNTIME_DIR}/bus" && systemctl --user start openclaw-gateway.service`
          )
        } catch {}
      }

      try {
        await waitTime(3000)
        let res: any = await this.getGatewayStatus()
        if (res?.isRunning) {
          return resolve(true)
        }
        await waitTime(3000)
        res = await this.getGatewayStatus()
        if (res?.isRunning) {
          return resolve(true)
        }
        reject(I18nT('openclaw.startGatewayFail'))
      } catch (e: any) {
        reject(e?.message ?? I18nT('openclaw.startGatewayFail'))
      }
    })
  }

  /**
   * Stop gateway using Helper
   */
  stopGateway() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`openclaw gateway stop`)
        let all: PItem[] = []
        if (isWindows()) {
          all = await ProcessPidList()
        } else {
          all = await ProcessListFetch()
        }

        if (!all.length) {
          resolve(true)
          return
        }

        const find = all.find(
          (f) =>
            f?.COMMAND &&
            (f.COMMAND.includes('openclaw-gateway') ||
              (f.COMMAND.includes('openclaw') &&
                f.COMMAND.includes('gateway') &&
                f.COMMAND.includes('--port')))
        )

        if (find) {
          const arr = ProcessPidsByPid(find.PID, all)
          await ProcessKill('-9', arr)
        }

        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }
}

export default new OpenClaw()
