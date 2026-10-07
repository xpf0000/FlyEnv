export type ModelHardware = {
  ramGB: number
  vramGB: number
  loaded: boolean
}

export const modelHardwareFromReport = (report: Record<string, unknown>): ModelHardware => {
  const rows = (value: unknown): Array<Record<string, unknown>> =>
    (Array.isArray(value) ? value : value ? [value] : []) as Array<Record<string, unknown>>
  const ram = rows(report.memory).reduce((total, item) => total + Number(item.Capacity || 0), 0)
  const nvidia = rows(report.nvidia).map((item) => Number(item.MemoryTotalMiB || 0) / 1024)
  const gpu = rows(report.gpu).map((item) => Number(item.AdapterRAM || 0) / 1024 ** 3)
  const vram = Math.max(0, ...nvidia) || Math.max(0, ...gpu)
  return {
    ramGB: ram ? Math.round((ram / 1024 ** 3) * 100) / 100 : 0,
    vramGB: vram ? Math.round(vram * 100) / 100 : 0,
    loaded: true
  }
}

export const getModelSizeColorForHardware = (
  sizeGB: number,
  hardware: ModelHardware
): 'success' | 'warning' | 'danger' | undefined => {
  if (!hardware.loaded || !sizeGB) return undefined
  // Use the better available memory path consistently across all model sizes.
  const successLimit = Math.max(hardware.vramGB * 0.7, hardware.ramGB * 0.15)
  const warningLimit = Math.max(hardware.vramGB, hardware.ramGB * 0.3)
  if (sizeGB <= successLimit) return 'success'
  if (sizeGB <= warningLimit) return 'warning'
  return 'danger'
}
