import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuid, execPromiseWithEnv, readFile, remove, existsSync, waitTime } from '../../Fn'
import { isLinux, isWindows } from '@shared/utils'
import axios from 'axios'
import { fetchTags } from './image'

class Podman extends Base {
  constructor() {
    super()
    this.type = 'podman'
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

      resolve({
        version,
        machine
      })
    })
  }

  fetchContainerList(machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      let containers: any[] = []
      try {
        const cmd = isLinux()
          ? `podman ps -a --format json > "${tmp}" ${getRedirect()}`
          : `podman --connection ${machineName} ps -a --format json > "${tmp}" ${getRedirect()}`
        await execPromiseWithEnv(cmd)
        const content = await readFile(tmp, 'utf-8')
        const json = JSON.parse(content)
        containers = json.map((c: any) => ({
          id: c.Id,
          name: c.Names,
          Image: c.Image,
          ImageID: c.ImageID,
          Mounts: c.Mounts,
          Networks: c.Networks,
          command: c.Command,
          run: c.State === 'running',
          running: false,
          machineName: machineName,
          Ports: c.Ports.map((p: any) => {
            return {
              in: p.container_port,
              out: p.host_port
            }
          })
        }))
        resolve(containers)
      } catch (e: any) {
        console.log('fetchContainerList error: ', e)
        reject(e?.message ?? 'fail')
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
    })
  }

  fetchImageList(machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      let images: any[] = []
      try {
        const cmd = isLinux()
          ? `podman images --format json > "${tmp}" ${getRedirect()}`
          : `podman --connection ${machineName} images --format json > "${tmp}" ${getRedirect()}`
        await execPromiseWithEnv(cmd)
        const content = await readFile(tmp, 'utf-8')
        const json = JSON.parse(content)
        images = json.map((img: any) => ({
          id: img.Id,
          name: img.Names,
          tag: img.Tag,
          size: Number(img.Size),
          created: img.CreatedAt
        }))
        resolve(images)
      } catch (e: any) {
        console.log('fetchImageList error: ', e)
        reject(e?.message ?? 'fail')
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
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
        const cmd = isLinux()
          ? `podman start ${containerName}`
          : `podman --connection ${machineName} start ${containerName}`
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
        const cmd = isLinux()
          ? `podman stop ${containerName}`
          : `podman --connection ${machineName} stop ${containerName}`
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

  containerRemove(containerName: string, machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const cmd = isLinux()
          ? `podman rm -f ${containerName}`
          : `podman --connection ${machineName} rm -f ${containerName}`
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  imagePull(machineName: string, imageName: string, tag: string = 'latest') {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const cmd = isLinux()
          ? `podman pull ${imageName}:${tag}`
          : `podman --connection ${machineName} pull ${imageName}:${tag}`
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  imageRemove(machineName: string, imageId: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const cmd = isLinux()
          ? `podman rmi -f ${imageId}`
          : `podman --connection ${machineName} rmi -f ${imageId}`
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  fetchMachineInfo(machineName: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let info: any = {}
        if (isLinux()) {
          // Linux 下没有 machine，info 可返回空对象或本地 Podman 信息
          info = {}
        } else {
          const infoTmp = join(tmpdir(), `${uuid()}.txt`)
          try {
            await execPromiseWithEnv(
              `podman machine inspect ${machineName} > "${infoTmp}" ${getRedirect()}`
            )
            const content = await readFile(infoTmp, 'utf-8')
            info = JSON.parse(content)[0] ?? {}
          } catch (e: any) {
            console.error('podman machine inspect: ', e?.message)
            info = {}
          } finally {
            if (existsSync(infoTmp)) {
              await remove(infoTmp)
            }
          }
        }

        // 获取容器列表
        const containerRes = await this.fetchContainerList(machineName)
        // 获取镜像列表
        const imageRes = await this.fetchImageList(machineName)

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
      const arr: string[] = ['docker-compose', ...paths.map((p) => `-f "${p}"`)]
      if (projectName) {
        arr.push(`-p ${projectName}`)
      }
      arr.push('up -d')
      const env: any = {}
      if (!isWindows() && socket) {
        env.DOCKER_HOST = `unix://${socket}`
      }
      try {
        await execPromiseWithEnv(arr.join(' '), { env })
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  composeStop(paths: string[], projectName: string, socket?: string) {
    return new ForkPromise(async (resolve, reject) => {
      const arr: string[] = ['docker-compose', ...paths.map((p) => `-f "${p}"`)]
      if (projectName) {
        arr.push(`-p ${projectName}`)
      }
      arr.push('down')
      const env: any = {}
      if (!isWindows() && socket) {
        env.DOCKER_HOST = `unix://${socket}`
      }
      try {
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
        const command = 'docker-compose --version'
        await execPromiseWithEnv(command)
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
      const list: string[] = ['docker-compose', ...paths.map((p) => `-f "${p}"`)]
      if (projectName) {
        list.push(`-p ${projectName}`)
      }
      list.push('ps --format json')
      const env: any = {}
      if (!isWindows() && socket) {
        env.DOCKER_HOST = `unix://${socket}`
      }
      console.log('isComposeRunning env: ', { env })
      try {
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
      const cmd = isLinux()
        ? `podman inspect ${containerName} --format json > "${tmp}"`
        : `podman --connection ${machineName} inspect ${containerName} --format json > "${tmp}"`
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
      const cmd = isLinux()
        ? `podman inspect ${id} --format json > "${tmp}"`
        : `podman --connection ${machineName} inspect ${id} --format json > "${tmp}"`
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
}

function getRedirect(): string {
  return isWindows() ? '2>NUL' : '2>/dev/null'
}

export default new Podman()
