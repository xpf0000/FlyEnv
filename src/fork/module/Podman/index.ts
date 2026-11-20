import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { SoftInstalled } from '@shared/app'
import { execFile } from 'node:child_process'
import { tmpdir, homedir } from 'node:os'
import { promisify } from 'node:util'
import { join } from 'node:path'
import {
  uuid,
  execPromiseWithEnv,
  readFile,
  writeFile,
  remove,
  existsSync,
  mkdirp,
  waitTime
} from '../../Fn'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import EnvSync from '@shared/EnvSync'
import axios from 'axios'
import {
  podmanConnectionName,
  type PodmanConnection,
  type PodmanServiceDestination
} from './connection'
import { fetchTags } from './image'
import {
  podmanContainerItem,
  podmanImageItem,
  type PodmanContainerItem,
  type PodmanImageItem
} from './list'
import { podmanMachineInitArgs, type PodmanMachineInitConfig } from './machineInit'
import { PODMAN_ROSETTA_DROPIN, podmanSupportsRosetta } from '@shared/podman-rosetta'

const execPodman = promisify(execFile)

/**
 * Podman 5.1.0 introduced the Rosetta toggle, read from containers.conf
 * ([machine] rosetta) when a machine is created or started. There is no
 * `--rosetta` CLI flag on `podman machine init` in any Podman version.
 */
class Podman extends Base {
  constructor() {
    super()
    this.type = 'podman'
  }

  private async runPodman(args: string[]) {
    return execPodman('podman', args, {
      env: await EnvSync.sync(),
      windowsHide: true,
      maxBuffer: Infinity
    })
  }

  private async serviceDestinations(): Promise<PodmanServiceDestination[]> {
    try {
      const { stdout } = await this.runPodman(['system', 'connection', 'ls', '--format', 'json'])
      const list = JSON.parse(stdout || '[]')
      return Array.isArray(list) ? list : []
    } catch (error) {
      console.error('podman system connection ls error: ', error)
      return []
    }
  }

  private async inspectMachine(machineName: string) {
    try {
      const { stdout } = await this.runPodman(['machine', 'inspect', machineName])
      return JSON.parse(stdout)[0] ?? {}
    } catch (error) {
      console.error('podman machine inspect error: ', error)
      return {}
    }
  }

  private async resolveConnection(
    machineName: string,
    info?: { Rootful?: boolean }
  ): Promise<PodmanConnection | undefined> {
    if (isLinux()) return undefined
    if (!machineName) throw new Error('Podman machine name is required')

    const [destinations, machineInfo] = await Promise.all([
      this.serviceDestinations(),
      info ?? this.inspectMachine(machineName)
    ])
    const name = podmanConnectionName(machineName, destinations, machineInfo.Rootful)
    return { name, uri: destinations.find((item) => item?.Name === name)?.URI }
  }

  /**
   * Write the Rosetta preference to a drop-in containers.conf so Podman
   * (>= 5.1.0, Apple Silicon) applies it on machine init/start.
   * The drop-in file never touches the user's own containers.conf
   * and can be rolled back by deleting it.
   */
  private async applyRosettaConfig(enable: boolean): Promise<Record<string, string> | undefined> {
    try {
      let version = ''
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await execPromiseWithEnv(`podman --version > "${tmp}" 2>&1`)
        version = ((await readFile(tmp, 'utf-8')) || '').split(' ')?.pop()?.trim() ?? ''
      } catch {
        version = ''
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
      if (!podmanSupportsRosetta(version)) {
        return
      }
      const env = await EnvSync.sync()
      const configHome = env.XDG_CONFIG_HOME || join(homedir(), '.config')
      const confDir = join(configHome, 'containers', 'containers.conf.d')
      const rosettaConfig = join(confDir, 'flyenv-podman.conf')
      await mkdirp(confDir)
      await writeFile(
        rosettaConfig,
        `${PODMAN_ROSETTA_DROPIN}[machine]\nrosetta = ${enable ? 'true' : 'false'}\n`
      )

      if (env.CONTAINERS_CONF && !env.CONTAINERS_CONF_OVERRIDE) {
        return { ...env, CONTAINERS_CONF_OVERRIDE: rosettaConfig }
      }
    } catch (e) {
      console.log('applyRosettaConfig error: ', e)
    }
  }

  private async getComposeCommand(): Promise<string> {
    try {
      await execPromiseWithEnv('docker-compose --version')
      return 'docker-compose'
    } catch {}

    await execPromiseWithEnv('docker compose version')
    return 'docker compose'
  }

  podmanInit() {
    return new ForkPromise(async (resolve) => {
      let version = ''
      let tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await execPromiseWithEnv(`podman --version > "${tmp}" ${getRedirect()}`)
        version = await readFile(tmp, 'utf-8')
        version = version.split(' ')?.pop()?.trim() ?? ''
      } catch (e) {
        console.log('podman --version error: ', e)
        version = ''
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }

      const machine: any[] = []
      tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await execPromiseWithEnv(`podman machine list --format json > "${tmp}" ${getRedirect()}`)
        const content = await readFile(tmp, 'utf-8')
        const json = JSON.parse(content)
        const arr = json.map((m: any) => ({
          name: m.Name,
          isDefault: m.Default,
          run: m.Running,
          running: m.Starting
        }))
        machine.push(...arr)
      } catch (e) {
        console.log('podman machine list error: ', e)
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }

      // 获取每个虚拟机的详细信息
      for (const m of machine) {
        m.info = await this.inspectMachine(m.name)
      }

      // 按创建时间倒序排列，最新创建的在最前
      machine.sort((a, b) => {
        const timeA = a.info?.Created ? new Date(a.info.Created).getTime() : 0
        const timeB = b.info?.Created ? new Date(b.info.Created).getTime() : 0
        return timeB - timeA
      })

      resolve({
        version,
        machine
      })
    })
  }

  private async readList(args: string[], connection?: PodmanConnection) {
    const scope = connection ? ['--connection', connection.name] : []
    const { stdout } = await this.runPodman([...scope, ...args])
    return JSON.parse(stdout)
  }

  private async readContainerList(machineName: string, connection?: PodmanConnection) {
    const json = await this.readList(['ps', '-a', '--format', 'json'], connection)
    return json.map((c: any) => podmanContainerItem(c, machineName)) as PodmanContainerItem[]
  }

  fetchContainerList(machineName: string) {
    return new ForkPromise<PodmanContainerItem[]>(async (resolve) => {
      const connection = await this.resolveConnection(machineName)
      resolve(await this.readContainerList(machineName, connection))
    })
  }

  private async readImageList(connection?: PodmanConnection) {
    const json = await this.readList(['images', '--format', 'json'], connection)
    return json.map((img: any) => ({ ...podmanImageItem(img), connection })) as PodmanImageItem[]
  }

  fetchImageList(machineName: string) {
    return new ForkPromise<PodmanImageItem[]>(async (resolve) => {
      const connection = await this.resolveConnection(machineName)
      resolve(await this.readImageList(connection))
    })
  }

  machineStart(machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`podman machine start ${machineName}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  machineStop(machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`podman machine stop ${machineName}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  machineReStart(machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await this.machineStop(machineName)
        await waitTime(500)
        await this.machineStart(machineName)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  containerStart(containerName: string, machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const connection = (await this.resolveConnection(machineName))?.name
        const cmd = isLinux()
          ? `podman start ${containerName}`
          : `podman --connection ${connection} start ${containerName}`
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  containerStop(containerName: string, machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const connection = (await this.resolveConnection(machineName))?.name
        const cmd = isLinux()
          ? `podman stop ${containerName}`
          : `podman --connection ${connection} stop ${containerName}`
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  machineRemove(machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await execPromiseWithEnv(`podman machine rm -f ${machineName}`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  machineInit(config: PodmanMachineInitConfig) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        console.log('machineInit config: ', config)

        const rosettaEnv = isMacOS() ? await this.applyRosettaConfig(!!config.rosetta) : undefined
        const args = podmanMachineInitArgs(config)

        await execPromiseWithEnv(args.join(' '), rosettaEnv ? { env: rosettaEnv } : undefined)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  containerRemove(containerName: string, machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const connection = (await this.resolveConnection(machineName))?.name
        const cmd = isLinux()
          ? `podman rm -f ${containerName}`
          : `podman --connection ${connection} rm -f ${containerName}`
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  machineSet(config: { name: string; cpus: number; memory: number; rootful: boolean }) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const { name, cpus, memory, rootful } = config

        // 先检查虚拟机是否在运行
        let wasRunning = false
        try {
          const tmp = join(tmpdir(), `${uuid()}.txt`)
          await execPromiseWithEnv(`podman machine list --format json > "${tmp}" ${getRedirect()}`)
          const content = await readFile(tmp, 'utf-8')
          const machines = JSON.parse(content)
          const machine = machines.find((m: any) => m.Name === name)
          wasRunning = machine?.Running ?? false
          if (existsSync(tmp)) {
            await remove(tmp)
          }
        } catch {
          // ignore
        }

        // 如果正在运行，先停止
        if (wasRunning) {
          await execPromiseWithEnv(`podman machine stop ${name}`)
        }

        const args: string[] = ['podman machine set']

        args.push(`--cpus ${cpus}`)
        args.push(`--memory ${memory}`)

        if (rootful) {
          args.push('--rootful')
        } else {
          args.push('--rootful=false')
        }

        args.push(name)

        await execPromiseWithEnv(args.join(' '))

        // 如果之前是运行状态，重新启动
        if (wasRunning) {
          await execPromiseWithEnv(`podman machine start ${name}`)
        }

        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  imagePull(machineName: string, imageName: string, tag: string = 'latest') {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const connection = (await this.resolveConnection(machineName))?.name
        const cmd = isLinux()
          ? `podman pull ${imageName}:${tag}`
          : `podman --connection ${connection} pull ${imageName}:${tag}`
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  imageRemove(connection: PodmanConnection | undefined, imageId: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const args: string[] = []
        if (!isLinux()) {
          const destinations = await this.serviceDestinations()
          const destination = destinations.find((item) => item?.Name === connection?.name)
          if (!connection?.uri || destination?.URI !== connection.uri) {
            throw new Error(
              'Podman connection is no longer available for this image. Refresh the image list.'
            )
          }
          args.push('--connection', connection.name)
        }
        await this.runPodman([...args, 'rmi', '-f', '--', imageId])
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  fetchMachineInfo(machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const info = isLinux() ? {} : await this.inspectMachine(machineName)
        const connection = await this.resolveConnection(machineName, info)

        const containerRes = await this.readContainerList(machineName, connection)
        const imageRes = await this.readImageList(connection)

        resolve({
          info,
          container: containerRes,
          images: imageRes
        })
      } catch (e: any) {
        console.error('fetchMachineInfo error: ', e?.message)
        reject(e?.message ?? 'fail')
      }
    })
  }

  fetchImagesVersion() {
    return new ForkPromise(async (resolve) => {
      const json = await axios({
        url: 'https://flyenv.com/static/podman/allImagesTags.json',
        method: 'get',
        timeout: 30000,
        withCredentials: false
      })
      resolve(json.data)
    })
  }

  composeStart(paths: string[], projectName: string, socket?: string) {
    return new ForkPromise(async (resolve, reject) => {
      const env: any = {}
      if (!isWindows() && socket) {
        env.DOCKER_HOST = `unix://${socket}`
      }
      try {
        const arr: string[] = [await this.getComposeCommand(), ...paths.map((p) => `-f "${p}"`)]
        if (projectName) {
          arr.push(`-p ${projectName}`)
        }
        arr.push('up -d')
        await execPromiseWithEnv(arr.join(' '), { env })
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  composeStop(paths: string[], projectName: string, socket?: string) {
    return new ForkPromise(async (resolve, reject) => {
      const env: any = {}
      if (!isWindows() && socket) {
        env.DOCKER_HOST = `unix://${socket}`
      }
      try {
        const arr: string[] = [await this.getComposeCommand(), ...paths.map((p) => `-f "${p}"`)]
        if (projectName) {
          arr.push(`-p ${projectName}`)
        }
        arr.push('down')
        await execPromiseWithEnv(arr.join(' '), { env })
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  checkIsComposeExists() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await this.getComposeCommand()
        resolve(true)
      } catch (err: any) {
        reject(err?.message ?? 'fail')
      }
    })
  }

  // 假设 composeName 是你的 compose 项目名（通常是 Pod 名）
  isComposeRunning(paths: string[], projectName: string, socket?: string) {
    return new ForkPromise(async (resolve, reject) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      const env: any = {}
      if (!isWindows() && socket) {
        env.DOCKER_HOST = `unix://${socket}`
      }
      console.log('isComposeRunning env: ', { env })
      try {
        const list: string[] = [await this.getComposeCommand(), ...paths.map((p) => `-f "${p}"`)]
        if (projectName) {
          list.push(`-p ${projectName}`)
        }
        list.push('ps --format json')
        await execPromiseWithEnv(`${list.join(' ')} > "${tmp}" ${getRedirect()}`, { env })
        const content = await readFile(tmp, 'utf-8')
        const arr = content.split('\n').filter((f) => {
          let json: any
          try {
            json = JSON.parse(f.trim())
          } catch {}
          return !!json
        })
        console.log('isComposeRunning arr: ', arr)
        resolve(arr.length > 0)
      } catch (e: any) {
        console.error('isComposeRunning error: ', e)
        reject(e?.message ?? 'fail')
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
    })
  }

  isContainerRunning(containerName: string, machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      const connection = (await this.resolveConnection(machineName))?.name
      const cmd = isLinux()
        ? `podman inspect ${containerName} --format json > "${tmp}"`
        : `podman --connection ${connection} inspect ${containerName} --format json > "${tmp}"`
      try {
        await execPromiseWithEnv(cmd)
        const content = await readFile(tmp, 'utf-8')
        const arr = JSON.parse(content)
        console.log('isContainerRunning arr: ', arr)
        const item: any = arr.shift()
        console.log('isContainerRunning item: ', item)
        resolve(item?.State?.Status === 'running')
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
    })
  }

  fetchContainerInfo(id: string, machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      const connection = (await this.resolveConnection(machineName))?.name
      const cmd = isLinux()
        ? `podman inspect ${id} --format json > "${tmp}"`
        : `podman --connection ${connection} inspect ${id} --format json > "${tmp}"`
      try {
        await execPromiseWithEnv(cmd)
        const content = await readFile(tmp, 'utf-8')
        const arr = JSON.parse(content)
        const item: any = arr.shift()
        resolve(item)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
    })
  }

  composeImageVersion(image: string) {
    return new ForkPromise(async (resolve, reject) => {
      fetchTags(image).then(resolve).catch(reject)
    })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // Podman 通过系统 CLI 与 machine 管理容器，FlyEnv 未为其维护独立的配置文件
    return []
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // Podman 通过系统 CLI 与 machine 管理容器，FlyEnv 未为其维护独立的日志文件
    return []
  }
}

function getRedirect(): string {
  return isWindows() ? '2>NUL' : '2>/dev/null'
}

export default new Podman()
