import BaseTask from '@/components/AI/Task/BaseTask'
import { addRandomSite, openSiteBaseService } from '../../Fn/Host'

export class CreateSiteTest extends BaseTask {
  constructor() {
    super()
    this.task = [
      {
        run: addRandomSite.bind(this)
      },
      {
        run: openSiteBaseService.bind(this)
      }
    ]
  }
}
