import { networkInterfaces } from 'os'

/**
 * 网络接口信息
 */
export interface NetworkInterfaceInfo {
  name: string
  ip: string
  isVirtual: boolean
  priority: number
}

/**
 * 虚拟网卡名称匹配模式
 * 用于识别虚拟机、容器等创建的虚拟网卡
 */
const VIRTUAL_INTERFACE_PATTERNS = [
  // VMware
  /^vmnet/i,
  /^vmware/i,
  // VirtualBox
  /^vboxnet/i,
  /^virtualbox/i,
  // WSL / Hyper-V
  /^wsl/i,
  /^eth[0-9]+$/i, // WSL 默认网卡名
  /^hv-/i,
  /^hyper-v/i,
  /^v Ethernet/i,
  // Docker
  /^docker/i,
  /^br-/i, // Docker bridge
  /^veth/i,
  // VPN
  /^tun[0-9]+/i,
  /^tap[0-9]+/i,
  /^ppp[0-9]+/i,
  /^utun[0-9]+/i, // macOS VPN
  /^gif[0-9]+/i, // Tunnel
  /^stf[0-9]+/i, // 6to4
  // 其他常见虚拟网卡
  /^lo/i, // Loopback (已经被过滤，但以防万一)
  /^anpi[0-9]+/i, // Apple NSE (Network Service Extension)
  /^llw[0-9]+/i, // Low Latency WLAN
  /^awdl[0-9]+/i, // Apple Wireless Direct Link
  /^bridge[0-9]+/i,
  /^pseudo/i
]

/**
 * 检查网卡名称是否是虚拟网卡
 */
function isVirtualInterface(name: string): boolean {
  return VIRTUAL_INTERFACE_PATTERNS.some((pattern) => pattern.test(name))
}

/**
 * 判断 IP 地址的优先级
 * 优先选择以下范围的 IP：
 * - 192.168.x.x (最常见的家庭/办公网络) - 优先级 100
 * - 10.x.x.x (大型企业网络) - 优先级 90
 * - 172.16-31.x.x (中型网络) - 优先级 80
 * - 其他 172.x.x.x (可能是虚拟机IP) - 优先级 20
 * - 100.64-127.x.x (CGNAT) - 优先级 30
 * - 169.254.x.x (链路本地) - 优先级 10
 * - 回环地址 - 优先级 0
 */
function getIPPriority(ip: string): number {
  // 回环地址优先级最低
  if (ip.startsWith('127.')) {
    return 0
  }

  // 169.254.x.x 是链路本地地址，优先级很低
  if (ip.startsWith('169.254.')) {
    return 10
  }

  // 192.168.x.x - 最常见的私有IP段，优先级最高
  if (ip.startsWith('192.168.')) {
    return 100
  }

  // 10.x.x.x - 大型网络，优先级次高
  if (ip.startsWith('10.')) {
    return 90
  }

  // 172.16-31.x.x - 注意只有 16-31 是私有地址
  if (ip.startsWith('172.')) {
    const secondOctet = parseInt(ip.split('.')[1], 10)
    if (secondOctet >= 16 && secondOctet <= 31) {
      return 80
    }
    // 其他 172.x.x.x 可能是虚拟机的虚拟IP，优先级较低
    return 20
  }

  // 其他内网IP（如 100.64-127.x.x CGNAT）
  if (ip.startsWith('100.')) {
    const secondOctet = parseInt(ip.split('.')[1], 10)
    if (secondOctet >= 64 && secondOctet <= 127) {
      return 30
    }
  }

  // 公网IP
  return 50
}

/**
 * 获取所有可用的真实局域网IP地址列表
 *
 * 该函数会返回所有合适的局域网IP地址，按优先级排序：
 * 1. 优先显示物理网卡的IP
 * 2. 按IP段优先级排序（192.168.x.x > 10.x.x.x > 172.16-31.x.x）
 * 3. 过滤掉明显的虚拟网卡（VMware、VirtualBox、WSL等）
 *
 * @returns 网络接口信息列表，已按优先级排序
 */
export function getAllLocalIPAddresses(): NetworkInterfaceInfo[] {
  const interfaces = networkInterfaces()
  const candidates: NetworkInterfaceInfo[] = []

  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!addresses || addresses.length === 0) {
      continue
    }

    const isVirtual = isVirtualInterface(name)

    for (const addr of addresses) {
      // 跳过内部地址（回环）
      if (addr.internal) {
        continue
      }

      // 只取IPv4 (family 可能是字符串 'IPv4' 或数字 4)
      const family = String(addr.family)
      if (family !== 'IPv4' && family !== '4') {
        continue
      }

      const ip = addr.address
      const priority = getIPPriority(ip)

      candidates.push({
        name,
        ip,
        isVirtual,
        priority
      })
    }
  }

  // 按优先级排序：
  // 1. 非虚拟网卡优先
  // 2. 高优先级IP段优先
  candidates.sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) {
      return a.isVirtual ? 1 : -1
    }
    return b.priority - a.priority
  })

  return candidates
}

/**
 * 获取推荐的主要IP地址（最佳候选）
 * @returns 最佳IP地址，如果没有找到则返回 '127.0.0.1'
 */
export function getPrimaryLocalIPAddress(): string {
  const candidates = getAllLocalIPAddresses()

  // 返回第一个非虚拟网卡的IP，如果没有则返回第一个候选
  const physicalIp = candidates.find((c) => !c.isVirtual)
  if (physicalIp) {
    return physicalIp.ip
  }

  if (candidates.length > 0) {
    return candidates[0].ip
  }

  return '127.0.0.1'
}

/**
 * 获取所有真实的（非虚拟）局域网IP地址
 * @returns 非虚拟网卡的IP地址列表
 */
export function getPhysicalIPAddresses(): string[] {
  const candidates = getAllLocalIPAddresses()
  return candidates.filter((c) => !c.isVirtual).map((c) => c.ip)
}

/**
 * 获取网络接口信息（用于调试）
 */
export function getNetworkInterfaceDetails(): Array<{
  name: string
  isVirtual: boolean
  addresses: Array<{ ip: string; family: string; internal: boolean; priority?: number }>
}> {
  const interfaces = networkInterfaces()
  const result: Array<{
    name: string
    isVirtual: boolean
    addresses: Array<{ ip: string; family: string; internal: boolean; priority?: number }>
  }> = []

  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!addresses || addresses.length === 0) continue

    const isVirtual = isVirtualInterface(name)

    result.push({
      name,
      isVirtual,
      addresses: addresses.map((addr) => {
        const familyStr = String(addr.family)
        return {
          ip: addr.address,
          family: familyStr === '4' || familyStr === 'IPv4' ? 'IPv4' : 'IPv6',
          internal: addr.internal,
          priority:
            familyStr === '4' || familyStr === 'IPv4' ? getIPPriority(addr.address) : undefined
        }
      })
    })
  }

  return result
}
