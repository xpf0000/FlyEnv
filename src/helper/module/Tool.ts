import { join } from 'node:path'
import { uuid, readFile, writeFile, execPromise } from '../util'
import { existsSync } from 'node:fs'
import { BaseManager } from './Base'

class Manager extends BaseManager {
  writeFileByRoot(file: string, content: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      let hasError = false
      let error: any
      try {
        await writeFile(file, content)
      } catch (e) {
        hasError = true
        error = e
      }
      if (hasError) {
        const cacheFile = join('/tmp', `${uuid()}.txt`)
        await writeFile(cacheFile, content)
        try {
          await execPromise(`cp -f "${cacheFile}" "${file}"`)
          hasError = false
        } catch (e) {
          error = e
        }
        try {
          await execPromise(`rm -rf "${cacheFile}"`)
        } catch {}
      }
      if (hasError) {
        reject(error)
        return
      }
      resolve(true)
    })
  }

  readFileByRoot(file: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      let content = ''
      let error: any
      let hasErr = false
      try {
        content = await readFile(file, 'utf-8')
      } catch (e) {
        error = e
        hasErr = true
      }
      if (hasErr) {
        const cacheFile = join(global.Server.Cache!, `${uuid()}.txt`)
        try {
          await execPromise(`cp -f "${file}" "${cacheFile}"`)
          content = await readFile(cacheFile, 'utf-8')
          await execPromise(`rm -rf "${cacheFile}"`)
          hasErr = false
        } catch (e) {
          error = e
          hasErr = true
        }
      }
      if (hasErr) {
        return reject(error)
      }
      resolve(content)
    })
  }

  processList() {
    return new Promise(async (resolve) => {
      let res = ''
      try {
        res = (await execPromise(`ps axo user,pid,ppid,command`)).stdout
      } catch {}
      if (!res) {
        return resolve([])
      }
      return resolve(
        res
          .trim()
          .split(`\n`)
          .filter((s) => !!s.trim())
          .map((s) => {
            const arr = s.split(' ').filter((s) => !!s.trim())
            const USER = arr.shift()
            const PID = arr.shift()
            const PPID = arr.shift()
            const COMMAND = arr.join(' ')
            return {
              USER,
              PID,
              PPID,
              COMMAND
            }
          })
      )
    })
  }

  rm(dir: string) {
    return new Promise(async (resolve) => {
      try {
        await execPromise(`rm -rf "${dir}"`)
      } catch {}
      resolve(true)
    })
  }

  chmod(dir: string, flag: string) {
    return new Promise(async (resolve) => {
      if (existsSync(dir)) {
        try {
          await execPromise(`chmod ${flag} "${dir}"`)
        } catch {}
      }
      resolve(true)
    })
  }

  kill(sig: string, pids: string[]) {
    return new Promise(async (resolve) => {
      try {
        await execPromise(`kill ${sig} ${pids.join(' ')}`)
      } catch {}
      resolve(true)
    })
  }

  ln_s(dir: string, dir1: string) {
    return new Promise(async (resolve) => {
      if (existsSync(dir)) {
        try {
          await execPromise(`ln -s "${dir}" "${dir1}"`)
        } catch {}
      }
      resolve(true)
    })
  }

  killPorts(ports: Array<string>) {
    return new Promise(async (resolve) => {
      const pids: Set<string> = new Set()
      for (const port of ports) {
        let res: any = await execPromise(
          `lsof -nP -i:${port} | grep '(LISTEN)' | awk '{print $1,$2,$3,$9,$10}'`
        )
        res = res?.stdout ?? ''
        const arr: Array<string> = res
          .split('\n')
          .filter((p: string) => p.includes(`:${port} (LISTEN)`))
          .map((a: any) => {
            const list = a.split(' ').filter((s: string) => {
              return s.trim().length > 0
            })
            console.log('list: ', list)
            list.shift()
            return list.shift()
          })
        arr.forEach((a: string) => pids.add(a))
      }
      if (pids.size > 0) {
        try {
          await execPromise(['kill', '-9', ...Array.from(pids)].join(' '))
        } catch {}
      }
      resolve(true)
    })
  }

  getPortPids(port: string) {
    return new Promise(async (resolve) => {
      const res = await execPromise(`lsof -nP -i:${port} | awk '{print $1,$2,$3}'`)
      const arr = res.stdout
        .toString()
        .trim()
        .split('\n')
        .filter((v: any, i: number) => {
          return i > 0
        })
        .map((a: any) => {
          const list = a.split(' ').filter((s: string) => {
            return s.trim().length > 0
          })
          const USER = list.pop()
          const PID = list.pop()
          const COMMAND = list.join(' ')
          return {
            USER,
            PID,
            COMMAND
          }
        })
      resolve(arr)
    })
  }
}

export default new Manager()
