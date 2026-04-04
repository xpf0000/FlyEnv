import { spawn } from 'node:child_process'
import { openSync, closeSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { mkdirp, remove, writeFile } from '../../Fn'
import { ProcessKill } from '@shared/Process'

export class SlimTunnel {
  id: string = ''
  slimBin: string = 'slim'

  /** subdomain on slim.show, e.g. "myapp" → https://myapp.slim.show */
  subdomain: string = ''
  /** local port to expose, e.g. 3000 */
  port: number = 0
  /** optional password protection */
  password: string = ''
  /** optional TTL, e.g. "30m" */
  ttl: string = ''

  /** populated after start */
  pid: string = ''
  /** public URL returned by slim */
  publicUrl: string = ''

  private async startSlim(
    onData: (line: string) => void
  ): Promise<{ pid: string; publicUrl: string }> {
    const baseDir = join(global.Server.BaseDir!, 'slim-tunnel')
    await mkdirp(baseDir)

    const pidPath = join(baseDir, `${this.id}.pid`)
    const sharedLog = join(baseDir, 'slim.log')
    const sharedErrLog = join(baseDir, 'slim-error.log')

    await remove(pidPath)

    const args: string[] = ['share', '--port', String(this.port)]

    if (this.subdomain) {
      args.push('--subdomain', this.subdomain)
    }
    if (this.password) {
      args.push('--password', this.password)
    }
    if (this.ttl) {
      args.push('--ttl', this.ttl)
    }

    const errFd = openSync(sharedErrLog, 'a')

    const cp = spawn(this.slimBin, args, {
      detached: true,
      stdio: ['ignore', 'pipe', errFd],
      cwd: dirname(this.slimBin) === '.' ? undefined : dirname(this.slimBin),
      windowsHide: true
    })

    closeSync(errFd)

    return new Promise<{ pid: string; publicUrl: string }>((resolve, reject) => {
      let publicUrl = ''
      let settled = false

      const earlyExit = (code: number) => {
        if (settled) return
        settled = true
        reject(new Error(`slim exited early with code ${code}`))
      }
      cp.on('exit', earlyExit)

      cp.on('error', (e) => {
        if (settled) return
        settled = true
        reject(new Error(`slim failed to start: ${e.message}`))
      })

      cp.stdout?.on('data', (data: Buffer) => {
        const line = data.toString()
        onData(line)
        try {
          appendFileSync(sharedLog, line)
        } catch {}
        // Slim prints something like: ✓ https://demo.slim.show → localhost:3000
        const m = line.match(/https?:\/\/[^\s→]+/i)
        if (m && !publicUrl) {
          publicUrl = m[0].trim()
        }
      })

      // Give slim 6 seconds to print the public URL then consider it stable
      setTimeout(async () => {
        if (settled) return
        settled = true
        cp.off('exit', earlyExit)
        if (cp.pid) {
          const pid = String(cp.pid)
          await writeFile(pidPath, pid)
          cp.unref()
          resolve({ pid, publicUrl })
        } else {
          reject(new Error('slim failed to start: no PID'))
        }
      }, 6000)
    })
  }

  async start(onData: (line: string) => void): Promise<this> {
    if (!this.slimBin) {
      throw new Error('slim binary not found — please install slim first')
    }
    const { pid, publicUrl } = await this.startSlim(onData)
    this.pid = pid
    this.publicUrl = publicUrl
    return this
  }

  async stop(): Promise<void> {
    if (!this.pid) return
    try {
      await ProcessKill('-INT', [this.pid])
    } catch {}
    this.pid = ''
    this.publicUrl = ''
  }
}
