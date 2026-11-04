import type { PItem } from './Process'

// Match startup sampling and the helper: English lstart, always in UTC.
export const unixProcessEnv = () => ({ ...process.env, LC_ALL: 'C', LANG: 'C', TZ: 'UTC' })
export const unixProcessListArgs = ['axww', '-o', 'user=,pid=,ppid=,lstart=,command=']

export const parseUnixProcessCreated = (value: string): string => {
  const created = value.trim().replace(/\s+/g, ' ')
  if (!/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/.test(created)) {
    throw new Error('Invalid ps process creation time')
  }
  const time = Date.parse(`${created} UTC`)
  if (!Number.isFinite(time)) throw new Error('Invalid ps process creation time')
  return new Date(time).toISOString()
}

export const parseUnixProcessList = (stdout: string): PItem[] => {
  if (!stdout.trim()) throw new Error('ps returned an empty process list')
  return stdout
    .split('\n')
    .filter((line) => !!line.trim())
    .map((line) => {
      const fields = line.trim().split(/\s+/)
      if (fields.length < 8 || !/^\d+$/.test(fields[1]) || !/^\d+$/.test(fields[2])) {
        throw new Error('Invalid ps process list output')
      }
      return {
        USER: fields[0],
        PID: fields[1],
        PPID: fields[2],
        CREATED: parseUnixProcessCreated(fields.slice(3, 8).join(' ')),
        COMMAND: fields.slice(8).join(' ')
      }
    })
}
