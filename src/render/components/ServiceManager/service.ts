import { reactive } from 'vue'
export interface ServiceItem {
  fetching: boolean
}
export const Service: { [k: string]: ServiceItem } = reactive({})
