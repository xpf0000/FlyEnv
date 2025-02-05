<template>
  <li @click.stop="toExtension">
    <yb-icon :svg="import('@/svg/extend.svg?raw')" width="13" height="13" />
    <span class="ml-15">{{ I18nT('php.extension') }}</span>
  </li>
</template>
<script lang="ts" setup>
  import type { SoftInstalled } from '@/store/brew'
  import { I18nT } from '@shared/lang'
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
