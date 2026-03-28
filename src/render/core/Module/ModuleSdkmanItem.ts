import type { AllAppModule } from '@/core/type'

export class ModuleSdkmanItem {
  typeFlag: AllAppModule = 'java'
  version: string = ''
  installed: boolean = false
  name: string = ''
  vendor: string = ''
  identifier: string = ''

  constructor(item: any) {
    Object.assign(this, item)
  }
}
