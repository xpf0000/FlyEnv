import BaseTask from '@web/components/AI/Task/BaseTask'
import { addRandaSite, openSiteBaseService } from '../../Fn/Host'

export class CreateSiteTest extends BaseTask {
  constructor() {
    super()
    this.task = [
      {
        run: addRandaSite.bind(this)
      },
      {
        run: openSiteBaseService.bind(this)
      }
    ]
  }
}
