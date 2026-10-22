// Fork descriptors join with node:path ('\' on Windows) while the renderer joins with
// pathe ('/'). Identity lookups must compare the same path, not the same separators.
export const instanceBinKey = (bin: string) => bin.replace(/\\/g, '/')

export class InstanceServices<
  T extends { bin: string; run?: boolean; running?: boolean; _onStart?: any }
> {
  private entries = new Map<string, T>()
  constructor(
    private readonly module: () => any,
    private readonly create: (row: any) => T,
    private readonly assertStart: () => void = () => {}
  ) {}
  sync(rows: any[]) {
    const next = new Map<string, T>()
    for (const row of rows) {
      const key = instanceBinKey(row.bin)
      let item = this.entries.get(key)
      if (item) {
        const copy = { ...row }
        delete copy.run
        delete copy.running
        Object.assign(item, copy)
      } else {
        item = this.create(row)
        item._onStart = async (...args: any[]) => {
          this.assertStart()
          return this.module().onItemStart(...args)
        }
      }
      next.set(key, item)
    }
    this.entries = next
  }
  item(bin: string): T {
    const item = this.entries.get(instanceBinKey(bin))
    if (!item) throw new Error('Instance lifecycle is unavailable; refresh the list')
    return item
  }
  get items() {
    return [...this.entries.values()]
  }
}
