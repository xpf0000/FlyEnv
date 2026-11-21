<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <div class="shrink-0 px-5 pt-4">
      <p>{{ operationStatus }}</p>
      <p
        v-if="homebrewUpgrade.error"
        class="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all text-xs"
        >{{ homebrewUpgrade.error }}</p
      >
    </div>
    <div class="min-h-0 flex-1 overflow-hidden p-5">
      <div
        ref="terminalDom"
        role="region"
        :aria-label="I18nT('versionmanager.brewUpgradeLogs')"
        class="h-full w-full overflow-hidden"
      ></div>
    </div>
    <div class="el-card__footer shrink-0">
      <el-button
        v-if="homebrewUpgrade.terminalFinished"
        type="primary"
        @click.stop="homebrewUpgrade.dismissTerminal()"
        >{{ I18nT('base.confirm') }}</el-button
      >
      <el-button
        v-else
        :disabled="!homebrewUpgrade.terminalCanCancel || homebrewUpgrade.cancelRequested"
        @click.stop="homebrewUpgrade.cancelTerminal()"
        >{{ I18nT('base.cancel') }}</el-button
      >
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { BrewSetup } from './setup'
  import { homebrewUpgrade } from './Controller'

  const terminalDom = ref<HTMLElement>()
  const operationStatus = computed(() => {
    if (homebrewUpgrade.result?.postprocessError) return I18nT('versionmanager.brewPackagePartial')
    const phase = homebrewUpgrade.phase
    if (phase === 'failed' && homebrewUpgrade.result?.action !== 'upgrade')
      return I18nT('base.fail')
    if (phase === 'succeeded')
      return I18nT(
        homebrewUpgrade.refreshFailed
          ? 'versionmanager.brewUpgradeRefreshFailed'
          : homebrewUpgrade.result?.action === 'upgrade'
            ? 'versionmanager.brewUpgradeSuccess'
            : 'versionmanager.brewPackageSuccess'
      )
    return I18nT(`versionmanager.brewUpgradePhase.${phase}`)
  })
  // Homebrew uses the same global XTerm and NodePTY as the existing installer.
  // The view detaches on navigation while the operation retains its terminal.
  const terminal = BrewSetup.xterm
  let attachedDom: HTMLElement | undefined
  const resize = new ResizeObserver(() => terminal?.onWindowResit())
  onMounted(async () => {
    const dom = terminalDom.value
    if (!dom || !terminal) return
    attachedDom = dom
    if (!(await terminal.mount(dom, {}).catch(() => false))) return
    if (terminal.dom === dom) resize.observe(dom)
  })
  onUnmounted(() => {
    resize.disconnect()
    if (attachedDom && terminal?.dom === attachedDom) terminal?.unmounted()
  })
</script>
