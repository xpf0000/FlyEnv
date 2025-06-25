<template>
  <li @click.stop="toExtension">
    <yb-icon class="p-[1px]" :svg="import('@/svg/extend.svg?raw')" width="17" height="17" />
    <span class="ml-3">{{ I18nT('php.extension') }}</span>
  </li>
</template>
<script lang="ts" setup>
  import type { SoftInstalled } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  const props = defineProps<{
    item: SoftInstalled
  }>()

  let ExtensionVM: any
  import('@/components/PostgreSql/Extension/index.vue').then((res) => {
    ExtensionVM = res.default
  })

  const toExtension = () => {
    AsyncComponentShow(ExtensionVM, {
      version: props.item
    }).then()
  }
</script>
