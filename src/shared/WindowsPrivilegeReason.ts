/**
 * 授权原因仅供界面说明：不传文件内容、脚本、nonce、证书内容或进程命令行，
 * 也不参与动作白名单和执行授权。保持纯数据依赖，renderer 可以安全导入。
 */
const reasonKinds = [
  'writeFileByRoot',
  'writeBufferBase64ByRoot',
  'readFileByRoot',
  'rm',
  'ensureFlyEnvDataDirectory',
  'setSystemPath',
  'setSystemEnv',
  'pathAdd',
  'pathRemove',
  'pathOrder',
  'envClear',
  'shellRuntime',
  'shellProfile',
  'autoStartEnable',
  'autoStartDisable',
  'sslAddTrustedCert',
  'kill',
  'killPorts',
  'dnsRefresh',
  'getSystemPath',
  'processListWin',
  'getPortPids',
  'sslFindCertificate'
] as const

export type WindowsPrivilegeReasonKind = (typeof reasonKinds)[number]
export type WindowsPrivilegeReasonItem = {
  kind: WindowsPrivilegeReasonKind
  target: string
}
export type WindowsPrivilegeReason = {
  items: WindowsPrivilegeReasonItem[]
  omitted?: number
}
export type WindowsPrivilegeChoice = {
  id: string
  operation: string
  reason?: WindowsPrivilegeReason
}

const allowedKinds = new Set<string>(reasonKinds)
const MAX_ITEMS = 32
const MAX_TARGET_LENGTH = 4096

/**
 * main/fork/renderer 共用的显示载荷边界。忽略未知类型/非法条目，复制快照并
 * 限制项目数与长度，避免长 PATH 撑爆弹窗或后续参数修改改变正在显示的原因。
 * 截断只作用于显示数据，完整业务参数仍由现有执行层独立校验/使用。
 */
export const sanitizeWindowsPrivilegeReason = (
  value: unknown
): WindowsPrivilegeReason | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Partial<WindowsPrivilegeReason>
  if (!Array.isArray(source.items)) return undefined
  const items: WindowsPrivilegeReasonItem[] = []
  let omitted =
    Number.isSafeInteger(source.omitted) && source.omitted! > 0
      ? Math.min(source.omitted!, 100_000)
      : 0
  for (const item of source.items) {
    if (!item || !allowedKinds.has(item.kind) || typeof item.target !== 'string') continue
    if (items.length >= MAX_ITEMS) {
      omitted += 1
      continue
    }
    // 控制字符只清理显示值；路径通过 Vue 文本插值呈现，不作为 HTML 或命令执行。
    const target = item.target.replace(/[\x00-\x1f\x7f]/gu, ' ')
    items.push({
      kind: item.kind,
      target: target.length > MAX_TARGET_LENGTH ? target.slice(0, MAX_TARGET_LENGTH) + '…' : target
    })
  }
  return items.length ? { items, ...(omitted > 0 ? { omitted } : {}) } : undefined
}

/**
 * 仅在业务动作已验证后调用。说明来自实际动作参数；PATH 使用原始期望快照
 * 做多重集合比较，保留重复条目的增删，不把完整 PATH 冒称本次新增项。
 */
export const buildWindowsPrivilegeReason = (
  module: string,
  fn: string,
  args: unknown[]
): WindowsPrivilegeReason | undefined => {
  const items: WindowsPrivilegeReasonItem[] = []
  const add = (kind: WindowsPrivilegeReasonKind, target: unknown) => {
    if (typeof target === 'string') items.push({ kind, target })
  }
  const addEnv = (key: string, value: unknown) => {
    if (typeof value !== 'string') return
    // 环境变量说明需要键和值，但凭据类键只显示键及掩码，不能泄露到弹窗/IPC 日志。
    const secret = /password|token|secret|credential|api[_-]?key|private[_-]?key/iu.test(key)
    // 当前执行器将空值写为注册表空字符串，含义是清空值而不是删除环境键。
    add(
      value === '' ? 'envClear' : 'setSystemEnv',
      value === '' ? key : `${key} = ${secret ? '••••' : value}`
    )
  }
  if (module === 'tools') {
    if (
      [
        'writeFileByRoot',
        'writeBufferBase64ByRoot',
        'readFileByRoot',
        'rm',
        'ensureFlyEnvDataDirectory'
      ].includes(fn)
    ) {
      add(fn as WindowsPrivilegeReasonKind, args[0])
    } else if (fn === 'setSystemPath' && Array.isArray(args[0])) {
      const next = args[0].filter((item): item is string => typeof item === 'string')
      if (typeof args[2] === 'string') {
        const before = args[2].split(';')
        const difference = (from: string[], against: string[]) => {
          const counts = new Map<string, number>()
          for (const entry of against) counts.set(entry, (counts.get(entry) ?? 0) + 1)
          return from.filter((entry) => {
            const count = counts.get(entry) ?? 0
            if (count === 0) return true
            counts.set(entry, count - 1)
            return false
          })
        }
        for (const entry of difference(next, before)) if (entry) add('pathAdd', entry)
        for (const entry of difference(before, next)) if (entry) add('pathRemove', entry)
        if (items.length === 0 && next.join(';') !== args[2]) add('pathOrder', next.join(';'))
      } else {
        // 无原始快照时只能说明完整目标值，不能猜测哪些条目来自本次添加。
        add('setSystemPath', next.join(';'))
      }
      if (args[1] && typeof args[1] === 'object') {
        for (const [key, value] of Object.entries(args[1])) addEnv(key, value)
      }
      if (items.length === 0) add('setSystemPath', next.join(';'))
    } else if (fn === 'setSystemEnv' && typeof args[0] === 'string') {
      addEnv(args[0], args[1])
    } else if (
      fn === 'installFlyEnvPowerShellIntegration' &&
      args[0] &&
      typeof args[0] === 'object'
    ) {
      const request = args[0] as { scriptPath?: string; profiles?: Array<{ path?: string }> }
      add('shellRuntime', request.scriptPath)
      for (const profile of request.profiles ?? []) add('shellProfile', profile.path)
    } else if (fn === 'setAutoStartWin') {
      add(
        args[0] === true ? 'autoStartEnable' : 'autoStartDisable',
        typeof args[2] === 'string' && args[2] ? `${args[1]} → ${args[2]}` : args[1]
      )
    } else if (fn === 'kill' && Array.isArray(args[1])) {
      add('kill', [...new Set(args[1])].join(', '))
    } else if (fn === 'killPorts' && Array.isArray(args[0])) {
      add('killPorts', [...new Set(args[0])].join(', '))
    } else if (fn === 'getPortPids') {
      add('getPortPids', String(args[0]))
    } else if (fn === 'getSystemPath' || fn === 'processListWin') {
      // 固定只读动作没有业务路径，具体系统读取对象由本地化标签完整说明。
      add(fn, '')
    }
  } else if (module === 'host' && fn === 'sslAddTrustedCert') {
    add('sslAddTrustedCert', `${args[0]}\\${args[1]}`)
  } else if (module === 'host' && fn === 'dnsRefresh') {
    // DNS 是固定系统缓存动作，没有文件/业务载荷；具体含义由本地化标签说明。
    add('dnsRefresh', '')
  } else if (module === 'host' && fn === 'sslFindCertificate') {
    add('sslFindCertificate', String(args[1] ?? 'FlyEnv-Root-CA'))
  }
  return sanitizeWindowsPrivilegeReason({ items })
}
