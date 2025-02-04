import { readFile, writeFile } from 'fs-extra'
import { join } from 'path'
import { uuid } from '../util'
import { exec } from 'child-process-promise'
import { existsSync } from 'fs'
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
          await exec(`cp -f "${cacheFile}" "${file}"`)
          hasError = false
        } catch (e) {
          error = e
        }
        try {
          await exec(`rm -rf "${cacheFile}"`)
        } catch (e) {}
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
          await exec(`cp -f "${file}" "${cacheFile}"`)
          content = await readFile(cacheFile, 'utf-8')
          await exec(`rm -rf "${cacheFile}"`)
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
        res = (await exec(`ps axo user,pid,ppid,command`)).stdout
      } catch (e) {}
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
      if (existsSync(dir)) {
        try {
          await exec(`rm -rf "${dir}"`)
        } catch (e) {}
      }
      resolve(true)
    })
  }

  kill(sig: string, pids: string[]) {
    return new Promise(async (resolve) => {
      try {
        await exec(`kill ${sig} ${pids.join(' ')}`)
      } catch (e) {}
      resolve(true)
    })
  }

  ln_s(dir: string, dir1: string) {
    return new Promise(async (resolve) => {
      if (existsSync(dir)) {
        try {
          await exec(`ln -s "${dir}" "${dir1}"`)
        } catch (e) {}
      }
      resolve(true)
    })
  }

  killPorts(ports: Array<string>) {
    return new Promise(async (resolve) => {
      const pids: Set<string> = new Set()
      for (const port of ports) {
        let res: any = await exec(
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
          await exec(['kill', '-9', ...Array.from(pids)].join(' '))
        } catch (e) {}
      }
      resolve(true)
    })
  }

  getPortPids(port: string) {
    return new Promise(async (resolve) => {
      const res = await exec(`lsof -nP -i:${port} | awk '{print $1,$2,$3}'`)
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
