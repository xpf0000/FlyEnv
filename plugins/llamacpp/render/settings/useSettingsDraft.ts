import { clone } from '../../shared/settings'
export class SettingsDraft<T> {
  value: T
  original: string
  generation = 0
  constructor(value: T) {
    this.value = clone(value)
    this.original = JSON.stringify(value)
  }
  get dirty() {
    return JSON.stringify(this.value) !== this.original
  }
  load(value: T) {
    this.generation++
    this.value = clone(value)
    this.original = JSON.stringify(value)
  }
  accept(generation: number, update: (value: T) => void) {
    if (generation !== this.generation) return false
    update(this.value)
    return true
  }
  async requestLeave(
    decide: () => Promise<'save' | 'discard' | 'cancel'>,
    save: () => Promise<void>
  ) {
    if (!this.dirty) return true
    const choice = await decide()
    if (choice === 'cancel') return false
    if (choice === 'save') await save()
    if (choice === 'discard') this.load(JSON.parse(this.original))
    return true
  }
}
export const useSettingsDraft = <T>(value: T) => new SettingsDraft(value)
