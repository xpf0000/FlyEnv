import { spawn } from 'node:child_process'
export function runCommand(bin: string, args: string[], timeout = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let output = '', settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      if (error) reject(error)
      else resolve(output)
    }
    const timer = setTimeout(() => { child.kill(); finish(new Error('MySQL command timed out; inspect instance logs')) }, timeout)
    const collect = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-65_536) }
    child.stdout.on('data', collect); child.stderr.on('data', collect)
    child.on('error', () => finish(new Error('Unable to execute MySQL binary')))
    child.on('close', code => finish(code === 0 ? undefined : new Error(`MySQL command failed (${code}); inspect instance logs`)))
  })
}
