<template>
  <li @click.stop="action('open')">
    <yb-icon :svg="import('@/svg/folder.svg?raw')" width="17" height="17" />
    <span class="ml-3">{{ I18nT('base.open') }}</span>
  </li>
  <li v-if="isWindows" @click.stop="action('conf')">
    <yb-icon :svg="import('@/svg/config.svg?raw')" width="17" height="17" />
    <span class="ml-3">{{ I18nT('php.editPhpIni') }}</span>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import type { SoftInstalled } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { shell } from '@/util/NodeFn'

  const props = defineProps<{
    item: SoftInstalled
  }>()

  const isWindows = computed(() => window.Server.isWindows)

  let ConfVM: any
  import('@/components/PHP/Config.vue').then((res) => {
    ConfVM = res.default
  })

  const action = (flag: 'open' | 'conf') => {
    if (flag === 'open') {
      shell.openPath(props.item.path)
      return
    }
    AsyncComponentShow(ConfVM, {
      version: props.item,
      typeFlag: 'frankenphp'
    }).then()
  }
</script>
