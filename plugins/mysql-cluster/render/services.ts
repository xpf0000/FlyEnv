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
      let item = this.entries.get(row.bin)
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
      next.set(row.bin, item)
    }
    this.entries = next
  }
  item(bin: string): T {
    const item = this.entries.get(bin)
    if (!item) throw new Error('Instance lifecycle is unavailable; refresh the list')
    return item
  }
  get items() {
    return [...this.entries.values()]
  }
}
