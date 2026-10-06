import type { PItem } from './Process'
import { isWindows } from './utils'

/**
 * CIM 和 Unix lstart 采样均为 UTC；将小数位补齐后比较，保留微秒精度，避免 Date.parse 的
 * 毫秒截断把极短间隔的不同创建时点当成相同。缺失/无效字段不生成时间证据。
 */
const comparableCreation = (value?: string): string | undefined => {
  if (!value || !Number.isFinite(Date.parse(value))) return undefined
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value)
  return match ? `${match[1]}.${(match[2] ?? '').padEnd(9, '0')}Z` : undefined
}

/** 两个同来源 UTC 创建时点的比较；undefined 代表无法比较，不代表进程已退出。 */
export const compareProcessCreation = (left?: string, right?: string): number | undefined => {
  const a = comparableCreation(left)
  const b = comparableCreation(right)
  if (a === undefined || b === undefined) return undefined
  return a === b ? 0 : a < b ? -1 : 1
}

/**
 * 候选筛选只返回 boolean，不因一条不可读/过期记录阻断其他目标。Windows 根
 * 使用创建时间和路径作为发现阶段归属证据；Unix 保留命令/进程标题归属，不要求
 * EXE。requireCommand=false 供已持启动身份、或直接按实际映像证明归属的根使用。
 * 这里仅判断证据是否齐备，模块仍须验证自己的配置/启动证明；不是单凭 EXE 授权。
 */
export const isReadableServiceStopRoot = (
  process: Pick<PItem, 'PID' | 'COMMAND' | 'CREATED' | 'EXECUTABLE'> | undefined,
  windows = isWindows(),
  requireCommand = true
): process is Pick<PItem, 'PID' | 'COMMAND' | 'CREATED' | 'EXECUTABLE'> => {
  if (!process || (requireCommand && !process.COMMAND?.trim())) return false
  if (!windows) return true
  return !!process.EXECUTABLE?.trim() && comparableCreation(process.CREATED) !== undefined
}

/**
 * ParentProcessId 是创建时留下的数字，原父退出后不会随 PID 复用更新。若本行
 * 比当前“父”更早创建，它不可能属于该父树；只过滤这种确定无效的边，不为
 * 正常 worker 另查路径/身份。不含 CREATED 的旧快照保持原 PID/PPID 规则。
 */
export const processSnapshotParentMatches = (
  child: Pick<PItem, 'PID' | 'PPID' | 'CREATED'>,
  parent: Pick<PItem, 'PID' | 'CREATED'>
): boolean => {
  if (child.PPID !== parent.PID) return false
  const order = compareProcessCreation(child.CREATED, parent.CREATED)
  return order === undefined || order >= 0
}

/**
 * 所有 PID 建树入口共用同一快照遍历。先建立经时间关系过滤的邻接表，再一次
 * 遍历收集完整后代；无系统查询，遇环只访问一次。默认必须有实际根；旧查询 API
 * 可显式允许缺席根的历史后代，但这个查询结果本身不构成结束进程的归属授权。
 */
export const collectProcessSnapshotTree = (
  pid: string,
  list: PItem[],
  allowMissingRoot = false
): PItem[] => {
  const byPid = new Map(list.map((item) => [item.PID, item]))
  const root = byPid.get(pid)
  if (!root && !allowMissingRoot) return []
  const children = new Map<string, PItem[]>()
  for (const item of list) {
    const parent = byPid.get(item.PPID)
    if (parent && !processSnapshotParentMatches(item, parent)) continue
    const siblings = children.get(item.PPID) ?? []
    siblings.push(item)
    children.set(item.PPID, siblings)
  }
  const result: PItem[] = root ? [root] : []
  const visited = new Set([pid])
  const visit = (parentPid: string) => {
    for (const child of children.get(parentPid) ?? []) {
      if (visited.has(child.PID)) continue
      visited.add(child.PID)
      result.push(child)
      visit(child.PID)
    }
  }
  visit(pid)
  return result
}
