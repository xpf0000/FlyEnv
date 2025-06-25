import { reactive } from 'vue'

export const PhpMyAdminTask: {
  fetching: boolean
  percent: number
} = reactive({
  fetching: false,
  percent: 0
})
