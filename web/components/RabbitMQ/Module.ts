import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@web/core/type'

const module: AppModuleItem = {
  typeFlag: 'rabbitmq',
  label: 'RabbitMQ',
  icon: import('@/svg/rabbitmq.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 12,
  isService: true,
  isTray: true
}
export default module
