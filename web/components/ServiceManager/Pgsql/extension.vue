<template>
  <el-popover
    effect="dark"
    popper-class="host-list-poper"
    placement="left-start"
    :show-arrow="false"
    width="auto"
    @before-enter="onShow"
  >
    <ul v-poper-fix class="host-list-menu">
      <li @click.stop="doInstallPgvector">
        <el-button
          :dark="true"
          :class="state"
          link
          :disabled="!state"
          :loading="state === 'installing'"
          :icon="Check"
          :type="state === 'installed' ? 'success' : ''"
        >
          <span>pgvector</span>
        </el-button>
      </li>
    </ul>
    <template #reference>
      <li>
        <yb-icon :svg="import('@/svg/extend.svg?raw')" width="13" height="13" />
        <span class="ml-15">{{ $t('php.extension') }}</span>
      </li>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { Check } from '@element-plus/icons-vue'
  import type { SoftInstalled } from '@web/store/brew'

  defineProps<{
    item: SoftInstalled
  }>()

  const state = computed(() => {
    return undefined
  })

  const onShow = () => {}

  const doInstallPgvector = () => {}
</script>
