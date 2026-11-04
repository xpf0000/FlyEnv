import { reactiveBind } from '@/util/Index'
import { ProcessToolController } from '../ProcessControl/Controller'

export type { ProcessItem } from '../ProcessControl/Controller'

export class PortKillController extends ProcessToolController {
  constructor() {
    super('port')
  }

  get lastPort(): string {
    return this.lastQuery
  }
}

export default reactiveBind(new PortKillController())
