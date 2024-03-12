import { reactive } from 'vue'
export interface ServiceItem {
  fetching: boolean
}
export const Service: { [k: string]: ServiceItem } = reactive({})

export const PhpMyAdminTask: {
  fetching: boolean
  percent: number
} = reactive({
  fetching: false,
  percent: 0
})
