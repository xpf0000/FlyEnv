import { reactive } from 'vue'
import type { XTerm } from '@/util/XTerm'

type FlyEnvHelperSetupType = {
  execXTerm?: XTerm
  loading: boolean
  command: string
  show: boolean
}

export const FlyEnvHelperSetup: FlyEnvHelperSetupType = reactive({
  show: false,
  execXTerm: undefined,
  loading: false,
  command: ''
})
