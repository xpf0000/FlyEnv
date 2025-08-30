import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuid, execPromiseWithEnv, readFile, remove, existsSync } from '../../Fn'

class Podman extends Base {
  constructor() {
    super()
    this.type = 'podman'
  }

  podmanInit() {
    return new ForkPromise(async (resolve) => {
      let version = ''
      let tmp = join(tmpdir(), `${uuid}.txt`)
      try {
        await execPromiseWithEnv(`podman --version > "${tmp}" 2 > /dev/null`)
        version = await readFile(tmp, 'utf-8')
      } catch {
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }

      const machine: any = []
      tmp = join(tmpdir(), `${uuid}.txt`)

      try {
        await execPromiseWithEnv(`podman machine list --format json > "${tmp}" 2 > /dev/null`)
        const content = await readFile(tmp, 'utf-8')
        const json = JSON.parse(content)
        const arr = json.map((m: any) => {
          return {
            name: m.Name,
            isDefault: m.Default,
            run: m.Running,
            running: m.Starting
          }
        })
        machine.push(...arr)
      } catch {
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }

      resolve({
        version,
        machine
      })
    })
  }
}
export default new Podman()
