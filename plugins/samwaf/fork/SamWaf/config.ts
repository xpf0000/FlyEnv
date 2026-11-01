export const SAMWAF_DEFAULT_PORT = 26666

/**
 * Default config seeded before the first start. Upstream generates
 * `ip_whitelist: 0.0.0.0/0,::/0` and binds *:26666; for a local dev tool the
 * admin panel must default to loopback only. Everything else mirrors upstream
 * defaults so SamWaf fills in the rest (emergency_path, db files, ...) itself.
 */
export const defaultConfigYml = (): string => {
  return `local_port: ${SAMWAF_DEFAULT_PORT}
database:
    driver: sqlite
cache:
    type: memory
security:
    ip_whitelist: 127.0.0.1/32,::1/128
zlog:
    debug_enable: false
    outputformat: console
`
}

/** Reads `local_port` from config.yml text. Falls back to 26666 on any doubt. */
export const parseAdminPort = (content: string): number => {
  const match = /^local_port:\s*(\d+)\s*$/m.exec(content ?? '')
  if (!match) return SAMWAF_DEFAULT_PORT
  const port = Number(match[1])
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return SAMWAF_DEFAULT_PORT
  return port
}

/**
 * data/initial_password.txt (fresh installs) looks like:
 *   SamWaf 初始管理员账号: admin
 *   初始随机口令: w|Vxb_=5vUaZk'uj
 * The password itself may contain any printable character except newline.
 */
export const parseInitialPassword = (content: string): string => {
  for (const line of (content ?? '').split('\n')) {
    const match = /^\s*初始随机口令\s*[:：]\s*(.+?)\s*$/.exec(line)
    if (match?.[1]) return match[1]
  }
  return ''
}
