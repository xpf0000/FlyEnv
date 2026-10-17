import { AsyncComponentShow } from '@/util/AsyncComponent'
import type { DamengInstalled } from './store'

// Mounted outside the entry page so sidebar/group start prompts survive navigation.
export const showSetupDialog = async (item?: DamengInstalled): Promise<boolean> => {
  const { default: SetupDialog } = await import('./SetupDialog.vue')
  return (await AsyncComponentShow(SetupDialog, { initialTarget: item, startup: true })) === true
}
