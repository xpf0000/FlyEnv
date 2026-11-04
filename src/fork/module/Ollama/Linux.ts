import { execPromiseWithEnv as execPromise } from '../../Fn'
import { totalmem, cpus } from 'os'

function parseSizeToBytes(sizeStr: string): number {
  const text = `${sizeStr || ''}`.trim().toUpperCase()
  const m = text.match(/([\d.]+)\s*(GB|MB|TB|KB|B)/)
  if (!m) return 0
  const val = parseFloat(m[1])
  const unit = m[2]
  if (unit === 'TB') return val * 1024 * 1024 * 1024 * 1024
  if (unit === 'GB') return val * 1024 * 1024 * 1024
  if (unit === 'MB') return val * 1024 * 1024
  if (unit === 'KB') return val * 1024
  return val
}

function ddrTypeFromString(typeStr: string): number {
  const t = `${typeStr || ''}`.toUpperCase()
  if (t.includes('DDR5')) return 34
  if (t.includes('DDR4')) return 26
  if (t.includes('DDR3')) return 24
  if (t.includes('DDR2')) return 21
  if (t.includes('DDR')) return 20
  return 0
}

export async function pcReportLinux(): Promise<any> {
  try {
    const logicalCpus = cpus().length || 1

    let cpuName = 'Unknown'
    let cores = 0
    let threads = 0
    let speedMHz = 0
    let manufacturer = 'Unknown'

    try {
      const lscpuRes = await execPromise('lscpu --json')
      const lscpuJson = JSON.parse(`${lscpuRes?.stdout ?? '{}'}`)
      const fields: Record<string, string> = {}
      for (const item of lscpuJson?.lscpu || []) {
        if (item?.field && item?.data) {
          fields[item.field.replace(':', '').trim()] = `${item.data}`
        }
      }
      cpuName = fields['Model name'] || 'Unknown'
      cores =
        parseInt(fields['Core(s) per socket'] || '0', 10) * parseInt(fields['Socket(s)'] || '1', 10)
      threads = parseInt(fields['CPU(s)'] || '0', 10) || logicalCpus
      const mhz = parseFloat(fields['CPU max MHz'] || fields['CPU MHz'] || '0')
      speedMHz = mhz || 0
      manufacturer = fields['Vendor ID'] || 'Unknown'
    } catch {
      try {
        const cpuinfoRes = await execPromise('cat /proc/cpuinfo')
        const cpuinfoOut = `${cpuinfoRes?.stdout ?? ''}`
        const modelMatch = cpuinfoOut.match(/model name\s*:\s*(.+)/)
        if (modelMatch) cpuName = modelMatch[1].trim()
        const vendorMatch = cpuinfoOut.match(/vendor_id\s*:\s*(.+)/)
        if (vendorMatch) manufacturer = vendorMatch[1].trim()
        const coreIds = new Set(cpuinfoOut.match(/core id\s*:\s*\d+/g) || [])
        const physicalIds = new Set(cpuinfoOut.match(/physical id\s*:\s*\d+/g) || [])
        cores = coreIds.size * physicalIds.size || logicalCpus
        threads = logicalCpus
        const mhzMatch = cpuinfoOut.match(/cpu MHz\s*:\s*([\d.]+)/)
        if (mhzMatch) speedMHz = parseFloat(mhzMatch[1])
      } catch {}
    }

    const cpu = [
      {
        Name: cpuName,
        Manufacturer: manufacturer,
        NumberOfCores: cores || logicalCpus,
        NumberOfLogicalProcessors: threads || logicalCpus,
        MaxClockSpeed: Math.round(speedMHz)
      }
    ]

    let memoryArr: any[] = []
    let memoryArray = [{ MemoryDevices: 1 }]

    try {
      const dmiRes = await execPromise('dmidecode -t memory')
      const dmiOut = `${dmiRes?.stdout ?? ''}`
      const devices = dmiOut.split('Memory Device').slice(1)
      const mods: any[] = []
      for (const dev of devices) {
        const sizeMatch = dev.match(/Size:\s*(.+)/)
        const sizeStr = sizeMatch ? sizeMatch[1].trim() : ''
        if (!sizeStr || sizeStr.toLowerCase().includes('no module')) continue
        const speedMatch = dev.match(/Speed:\s*(.+)/)
        const typeMatch = dev.match(/Type:\s*(.+)/)
        const manufMatch = dev.match(/Manufacturer:\s*(.+)/)
        const partMatch = dev.match(/Part Number:\s*(.+)/)
        const locatorMatch = dev.match(/Locator:\s*(.+)/)
        const bankMatch = dev.match(/Bank Locator:\s*(.+)/)
        mods.push({
          Capacity: parseSizeToBytes(sizeStr),
          ConfiguredClockSpeed: parseSizeToBytes(`${speedMatch?.[1] || ''}`),
          Speed: parseSizeToBytes(`${speedMatch?.[1] || ''}`),
          SMBIOSMemoryType: ddrTypeFromString(`${typeMatch?.[1] || ''}`),
          MemoryType: ddrTypeFromString(`${typeMatch?.[1] || ''}`),
          Manufacturer: `${manufMatch?.[1]?.trim() || ''}`,
          PartNumber: `${partMatch?.[1]?.trim() || ''}`,
          BankLabel: `${bankMatch?.[1]?.trim() || ''}`,
          DeviceLocator: `${locatorMatch?.[1]?.trim() || ''}`
        })
      }
      if (mods.length) {
        memoryArr = mods
        memoryArray = [{ MemoryDevices: mods.length }]
      }
    } catch {}

    if (!memoryArr.length) {
      try {
        const meminfoRes = await execPromise('cat /proc/meminfo')
        const meminfoOut = `${meminfoRes?.stdout ?? ''}`
        const totalMatch = meminfoOut.match(/MemTotal:\s*(\d+)\s*kB/)
        const totalKB = parseInt(totalMatch?.[1] || '0', 10) || 0
        if (totalKB > 0) {
          memoryArr = [
            {
              Capacity: totalKB * 1024,
              ConfiguredClockSpeed: 0,
              Speed: 0,
              SMBIOSMemoryType: 0,
              MemoryType: 0,
              Manufacturer: '',
              PartNumber: '',
              BankLabel: '',
              DeviceLocator: ''
            }
          ]
          memoryArray = [{ MemoryDevices: 1 }]
        }
      } catch {}
    }

    let gpu: any[] = []
    try {
      const lspciRes = await execPromise('lspci -nn | grep -E "VGA|3D|Display"')
      const lspciOut = `${lspciRes?.stdout ?? ''}`
      const lines = lspciOut.split('\n').filter((s) => s.trim())
      gpu = lines.map((line) => {
        const parts = line.split(': ')
        const desc = parts[1] || line
        const name = desc.replace(/\s*\[.+?\]/g, '').trim()
        let vendor = 'Unknown'
        const lower = name.toLowerCase()
        if (lower.includes('nvidia')) vendor = 'NVIDIA'
        else if (lower.includes('amd') || lower.includes('advanced micro')) vendor = 'AMD'
        else if (lower.includes('intel')) vendor = 'Intel'
        return {
          Name: name,
          AdapterCompatibility: vendor,
          DriverVersion: '',
          AdapterRAM: 0,
          CurrentHorizontalResolution: 0,
          CurrentVerticalResolution: 0,
          VideoProcessor: name,
          PNPDeviceID: ''
        }
      })
    } catch {}

    let nvidia: any[] = []
    try {
      const nvidiaRes = await execPromise(
        'nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits'
      )
      const nvidiaOut = `${nvidiaRes?.stdout ?? ''}`.trim()
      if (nvidiaOut) {
        nvidia = nvidiaOut.split('\n').map((line) => {
          const parts = line.split(',').map((s) => s.trim())
          return {
            Name: parts[0] || '',
            MemoryTotalMiB: parseInt(parts[1] || '0', 10) || 0,
            DriverVersion: parts[2] || ''
          }
        })
      }
    } catch {}

    let computerManufacturer = 'Unknown'
    let computerModel = 'Unknown'
    try {
      const productRes = await execPromise('cat /sys/class/dmi/id/product_name')
      computerModel = `${productRes?.stdout ?? ''}`.trim()
    } catch {}
    try {
      const vendorRes = await execPromise('cat /sys/class/dmi/id/board_vendor')
      computerManufacturer = `${vendorRes?.stdout ?? ''}`.trim()
    } catch {}

    const totalBytes = totalmem()

    let osCaption = 'Linux'
    try {
      const osRes = await execPromise('cat /etc/os-release')
      const osOut = `${osRes?.stdout ?? ''}`
      const prettyMatch = osOut.match(/PRETTY_NAME="(.+?)"/)
      if (prettyMatch) osCaption = prettyMatch[1]
    } catch {}

    return {
      os: {
        Caption: osCaption,
        Version: '',
        BuildNumber: '',
        OSArchitecture: process.arch
      },
      cpu,
      memory: memoryArr,
      memoryArray,
      gpu,
      computer: {
        Manufacturer: computerManufacturer,
        Model: computerModel,
        SystemType: process.arch,
        TotalPhysicalMemory: totalBytes
      },
      nvidia
    }
  } catch {
    return fallbackPcReportLinux()
  }
}

function fallbackPcReportLinux(): any {
  return {
    os: {
      Caption: 'Linux',
      Version: '',
      BuildNumber: '',
      OSArchitecture: process.arch
    },
    cpu: [],
    memory: [],
    memoryArray: [],
    gpu: [],
    computer: {
      Manufacturer: 'Unknown',
      Model: 'Unknown',
      SystemType: process.arch,
      TotalPhysicalMemory: totalmem()
    },
    nvidia: []
  }
}
