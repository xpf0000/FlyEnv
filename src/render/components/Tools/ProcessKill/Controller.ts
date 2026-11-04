import { reactiveBind } from '@/util/Index'
import { ProcessToolController } from '../ProcessControl/Controller'

export type { ProcessItem } from '../ProcessControl/Controller'

export class ProcessKillController extends ProcessToolController {
  constructor() {
    super('process')
  }

  get lastKey(): string {
    return this.lastQuery
  }
}

export default reactiveBind(new ProcessKillController())
