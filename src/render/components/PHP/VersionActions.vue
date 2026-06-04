<template>
  <li @click.stop="action('open')">
    <yb-icon :svg="import('@/svg/folder.svg?raw')" width="17" height="17" />
    <span class="ml-3">{{ I18nT('base.open') }}</span>
  </li>
  <li @click.stop="action('conf')">
    <yb-icon :svg="import('@/svg/config.svg?raw')" width="17" height="17" />
    <span class="ml-3">{{ I18nT('php.editPhpIni') }}</span>
  </li>
  <li @click.stop="action('disable_functions')">
    <yb-icon :svg="import('@/svg/config.svg?raw')" width="17" height="17" />
    <span class="ml-3">{{ I18nT('php.disableFunction.title') }}</span>
  </li>
  <li @click.stop="action('log-error')">
    <yb-icon :svg="import('@/svg/log.svg?raw')" width="17" height="17" />
    <span class="ml-3">{{ I18nT('base.errorLog') }}</span>
  </li>
  <li @click.stop="action('extend')">
    <yb-icon :svg="import('@/svg/extend.svg?raw')" width="17" height="17" />
    <span class="ml-3">{{ I18nT('php.extensions') }}</span>
  </li>
</template>

<script lang="ts" setup>
  import type { SoftInstalled } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { shell } from '@/util/NodeFn'

  const props = defineProps<{
    item: SoftInstalled
  }>()

  let ExtensionsVM: any
  import('./Extends.vue').then((res) => {
    ExtensionsVM = res.default
  })

  let ConfVM: any
  import('./Config.vue').then((res) => {
    ConfVM = res.default
  })

  let DisableFunctionVM: any
  import('./DisableFunction.vue').then((res) => {
    DisableFunctionVM = res.default
  })

  let LogErrorVM: any
  import('./ErrorLog.vue').then((res) => {
    LogErrorVM = res.default
  })

  const action = (flag: string) => {
    switch (flag) {
      case 'open':
        shell.openPath(props.item.path)
        break
      case 'conf':
        AsyncComponentShow(ConfVM, {
          version: props.item
        }).then()
        break
      case 'disable_functions':
        AsyncComponentShow(DisableFunctionVM, {
          version: props.item
        }).then()
        break
      case 'log-error':
        AsyncComponentShow(LogErrorVM, {
          version: props.item
        }).then()
        break
      case 'extend':
        AsyncComponentShow(ExtensionsVM, {
          version: props.item
        }).then()
        break
    }
  }
</script>
